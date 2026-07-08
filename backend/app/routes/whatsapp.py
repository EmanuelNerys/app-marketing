"""
WhatsApp Business Cloud API routes.

Fluxo por tenant:
1. Admin configura credenciais (phone_number_id, waba_id, access_token)
2. Webhook recebe mensagens e roteia pelo phone_number_id
3. Agentes enviam texto/template pelo chat
4. Admin gerencia templates (criar, listar, sincronizar, deletar)
"""
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.ws_manager import ws_manager
from app.models.user import User
from app.models.meta_connection import MetaConnection, PROVIDER_WHATSAPP, STATUS_ACTIVE
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.lead import Lead
from app.core.config import settings
from app.services import whatsapp_service
from app.services.meta_token_service import encrypt_token, decrypt_token, exchange_code_for_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WppCredentialsRequest(BaseModel):
    phone_number_id: str = Field(..., description="Phone Number ID do Meta (ex: '109843...')")
    phone_number: str = Field(..., description="Número exibível (ex: '+55 83 99999-9999')")
    waba_id: str = Field(..., description="WhatsApp Business Account ID")
    access_token: str = Field(..., description="System User Token ou token de longa duração")


class WppCredentialsOut(BaseModel):
    id: str
    tenant_id: str
    phone_number_id: str | None
    phone_number: str | None
    waba_id: str | None
    status: str
    updated_at: datetime


class EmbeddedSignupCompleteRequest(BaseModel):
    code: str = Field(..., description="Código retornado pelo FB.login (response_type=code)")
    waba_id: str = Field(..., description="WABA ID recebido via postMessage do fluxo")
    phone_number_id: str = Field(..., description="Phone Number ID recebido via postMessage do fluxo")


class SendTextRequest(BaseModel):
    to: str = Field(..., description="Número do destinatário com código do país (ex: '5583999999999')")
    text: str = Field(..., min_length=1)
    conversation_id: str | None = None


class SendTemplateRequest(BaseModel):
    to: str
    template_name: str
    language: str = "pt_BR"
    variables: list[str] = Field(default_factory=list,
                                  description="Valores para {{1}}, {{2}}, etc.")
    conversation_id: str | None = None


class BroadcastRequest(BaseModel):
    template_name: str
    language: str = "pt_BR"
    variables: list[str] = Field(default_factory=list,
                                 description="Valores fixos para {{1}}, {{2}}... aplicados a todos")
    lead_ids: list[str] | None = Field(
        default=None,
        description="Se informado, dispara só para esses leads. Senão, todos com telefone.",
    )


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9_]+$",
                      description="Nome em snake_case minúsculo")
    category: str = Field(..., pattern=r"^(MARKETING|UTILITY|AUTHENTICATION)$")
    language: str = "pt_BR"
    header_text: str | None = None
    body_text: str = Field(..., description="Corpo com variáveis {{1}}, {{2}}...")
    footer_text: str | None = None
    buttons: list[dict] | None = None


# ---------------------------------------------------------------------------
# Embedded Signup — onboarding do WhatsApp direto pelo popup do Facebook
# ---------------------------------------------------------------------------

@router.get("/embedded-signup/config")
async def embedded_signup_config(
    current_user: User = Depends(get_current_user),
):
    """App ID + Configuration ID para o front inicializar o Facebook JS SDK."""
    if not settings.whatsapp_config_id:
        raise HTTPException(
            status_code=503,
            detail=(
                "Embedded Signup não configurado. Defina WHATSAPP_CONFIG_ID no .env "
                "(Meta App Dashboard > WhatsApp > Embedded Signup > Configurations)."
            ),
        )
    return {"app_id": settings.meta_app_id, "config_id": settings.whatsapp_config_id}


@router.post("/embedded-signup/complete", response_model=WppCredentialsOut, status_code=201)
async def embedded_signup_complete(
    body: EmbeddedSignupCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Finaliza o Embedded Signup: troca o code por token, inscreve o app nos
    webhooks do WABA, registra o número na Cloud API e salva a conexão.
    """
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem conectar o WhatsApp.")

    try:
        token_data = await exchange_code_for_token(body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    token = token_data["access_token"]

    # Passo obrigatório: inscrever o app para receber webhooks deste WABA.
    sub_result = await whatsapp_service.subscribe_app_to_waba(token, body.waba_id)
    if sub_result.get("error"):
        logger.warning("Falha ao inscrever app no WABA %s: %s", body.waba_id, sub_result)

    # Passo obrigatório (uma vez): registrar o número na Cloud API.
    # Se já estiver registrado, a Meta retorna erro — não é fatal.
    pin = f"{secrets.randbelow(1_000_000):06d}"
    reg_result = await whatsapp_service.register_phone_number(token, body.phone_number_id, pin)
    if reg_result.get("error"):
        logger.info(
            "Registro do número %s retornou (pode já estar registrado): %s",
            body.phone_number_id, reg_result.get("error"),
        )

    # Busca o número de exibição para salvar de forma amigável.
    info = await whatsapp_service.get_phone_number_info(token, body.phone_number_id)
    display_number = info.get("display_phone_number") or body.phone_number_id

    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_WHATSAPP,
        )
    )
    conn = result.scalar_one_or_none()
    encrypted_token = encrypt_token(token)

    if conn:
        conn.phone_number_id = body.phone_number_id
        conn.phone_number = display_number
        conn.waba_id = body.waba_id
        conn.access_token_encrypted = encrypted_token
        conn.status = STATUS_ACTIVE
        conn.expires_at = token_data.get("expires_at")
        conn.updated_at = datetime.now(timezone.utc)
    else:
        conn = MetaConnection(
            id=str(uuid.uuid4()),
            account_id=current_user.tenant_id,
            provider=PROVIDER_WHATSAPP,
            phone_number_id=body.phone_number_id,
            phone_number=display_number,
            waba_id=body.waba_id,
            access_token_encrypted=encrypted_token,
            expires_at=token_data.get("expires_at"),
            status=STATUS_ACTIVE,
        )
        db.add(conn)

    await db.flush()
    logger.info(
        "Embedded Signup concluído: tenant=%s waba=%s phone=%s",
        current_user.tenant_id, body.waba_id, display_number,
    )

    return WppCredentialsOut(
        id=conn.id,
        tenant_id=conn.account_id,
        phone_number_id=conn.phone_number_id,
        phone_number=conn.phone_number,
        waba_id=conn.waba_id,
        status=conn.status,
        updated_at=conn.updated_at,
    )


# ---------------------------------------------------------------------------
# Credenciais — configuração manual por tenant (fallback / setups avançados)
# ---------------------------------------------------------------------------

@router.put("/credentials", response_model=WppCredentialsOut)
async def set_credentials(
    body: WppCredentialsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin define ou atualiza as credenciais WhatsApp do tenant."""
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem configurar credenciais.")

    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_WHATSAPP,
        )
    )
    conn = result.scalar_one_or_none()

    encrypted_token = encrypt_token(body.access_token)

    if conn:
        conn.phone_number_id = body.phone_number_id
        conn.phone_number = body.phone_number
        conn.waba_id = body.waba_id
        conn.access_token_encrypted = encrypted_token
        conn.status = STATUS_ACTIVE
        conn.updated_at = datetime.now(timezone.utc)
    else:
        conn = MetaConnection(
            id=str(uuid.uuid4()),
            account_id=current_user.tenant_id,
            provider=PROVIDER_WHATSAPP,
            phone_number_id=body.phone_number_id,
            phone_number=body.phone_number,
            waba_id=body.waba_id,
            access_token_encrypted=encrypted_token,
            status=STATUS_ACTIVE,
        )
        db.add(conn)

    await db.flush()
    return WppCredentialsOut(
        id=conn.id,
        tenant_id=conn.account_id,
        phone_number_id=conn.phone_number_id,
        phone_number=conn.phone_number,
        waba_id=conn.waba_id,
        status=conn.status,
        updated_at=conn.updated_at,
    )


@router.get("/credentials", response_model=WppCredentialsOut)
async def get_credentials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    return WppCredentialsOut(
        id=conn.id,
        tenant_id=conn.account_id,
        phone_number_id=conn.phone_number_id,
        phone_number=conn.phone_number,
        waba_id=conn.waba_id,
        status=conn.status,
        updated_at=conn.updated_at,
    )


# ---------------------------------------------------------------------------
# Envio de mensagens
# ---------------------------------------------------------------------------

@router.post("/send")
async def send_text(
    body: SendTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Envia mensagem de texto livre (válida apenas dentro da janela de 24h)."""
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    token = decrypt_token(conn.access_token_encrypted)

    result = await whatsapp_service.send_text(token, conn.phone_number_id, body.to, body.text)

    wamid = result.get("messages", [{}])[0].get("id")
    await _save_outbound(
        tenant_id=current_user.tenant_id,
        conv_id=body.conversation_id,
        sender=current_user.username,
        wa_to=body.to,
        text=body.text,
        wamid=wamid,
        db=db,
    )
    return {"status": "sent", "wamid": wamid}


@router.post("/send-template")
async def send_template(
    body: SendTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Envia template aprovado — funciona fora da janela de 24h."""
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    token = decrypt_token(conn.access_token_encrypted)

    components = []
    if body.variables:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in body.variables],
        })

    result = await whatsapp_service.send_template(
        token, conn.phone_number_id, body.to,
        body.template_name, body.language, components or None,
    )

    wamid = result.get("messages", [{}])[0].get("id")
    await _save_outbound(
        tenant_id=current_user.tenant_id,
        conv_id=body.conversation_id,
        sender=current_user.username,
        wa_to=body.to,
        text=f"[template:{body.template_name}] {' | '.join(body.variables)}",
        wamid=wamid,
        template_name=body.template_name,
        template_vars={"variables": body.variables},
        is_within_24h_window=False,
        db=db,
    )
    return {"status": "sent", "wamid": wamid}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista templates em cache local (da última sincronização)."""
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    return conn.meta_templates or []


@router.post("/templates/sync")
async def sync_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Busca templates atualizados na Meta e salva no banco."""
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem sincronizar templates.")
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    token = decrypt_token(conn.access_token_encrypted)

    templates = await whatsapp_service.list_templates(token, conn.waba_id)
    conn.meta_templates = templates
    conn.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return {"synced": len(templates), "templates": templates}


@router.post("/templates", status_code=201)
async def create_template(
    body: CreateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cria template na Meta (fica PENDING até aprovação)."""
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem criar templates.")
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    token = decrypt_token(conn.access_token_encrypted)

    components: list[dict] = []
    if body.header_text:
        components.append({"type": "HEADER", "format": "TEXT", "text": body.header_text})
    components.append({"type": "BODY", "text": body.body_text})
    if body.footer_text:
        components.append({"type": "FOOTER", "text": body.footer_text})
    if body.buttons:
        components.append({"type": "BUTTONS", "buttons": body.buttons})

    result = await whatsapp_service.create_template(
        token, conn.waba_id, body.name, body.category, body.language, components
    )
    return result


@router.delete("/templates/{template_name}", status_code=204)
async def delete_template(
    template_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem deletar templates.")
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    token = decrypt_token(conn.access_token_encrypted)
    await whatsapp_service.delete_template(token, conn.waba_id, template_name)


# ---------------------------------------------------------------------------
# Estatísticas mensais
# ---------------------------------------------------------------------------

@router.get("/stats")
async def monthly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    return {
        "marketing": conn.conv_count_marketing or 0,
        "utility": conn.conv_count_utility or 0,
        "service": conn.conv_count_service or 0,
        "authentication": conn.conv_count_auth or 0,
    }


# Preço estimado por conversa (BRL), por categoria da Meta.
# Ponto único de configuração — ajuste aqui quando a Meta mudar os valores.
WPP_PRICING: dict[str, float] = {
    "marketing": 0.33,
    "utility": 0.12,
    "authentication": 0.15,
    "service": 0.0,  # conversas iniciadas pelo cliente — sem custo
}


@router.get("/costs")
async def monthly_costs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Custo estimado do mês por categoria (contagem × preço) + total."""
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    counts = {
        "marketing": conn.conv_count_marketing or 0,
        "utility": conn.conv_count_utility or 0,
        "service": conn.conv_count_service or 0,
        "authentication": conn.conv_count_auth or 0,
    }
    breakdown: dict[str, dict] = {}
    total = 0.0
    for cat, count in counts.items():
        unit = WPP_PRICING.get(cat, 0.0)
        subtotal = round(count * unit, 2)
        total += subtotal
        breakdown[cat] = {"count": count, "unit_cost": unit, "subtotal": subtotal}

    return {
        "currency": "BRL",
        "pricing": WPP_PRICING,
        "breakdown": breakdown,
        "total": round(total, 2),
    }


# Janela do follow-up: aparece após MIN dias sem resposta, some após MAX dias.
FOLLOWUP_MIN_DAYS = 3
FOLLOWUP_MAX_DAYS = 14


@router.get("/followups")
async def followups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Follow-ups de templates de marketing:
      - pending: cliente NÃO respondeu ao template há 3-14 dias (janela de follow-up)
      - responded: cliente respondeu após o disparo (últimos 30 dias)
    """
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    now = datetime.now(timezone.utc)

    # Nomes de templates de marketing (do cache sincronizado da Meta).
    # Se o cache estiver vazio, considera todos os templates.
    mkt_names = {
        t.get("name") for t in (conn.meta_templates or [])
        if str(t.get("category", "")).upper() == "MARKETING"
    }

    # Últimos disparos de template por conversa (30 dias)
    result = await db.execute(
        select(Message).where(
            Message.tenant_id == current_user.tenant_id,
            Message.direction == "outbound",
            Message.template_name.isnot(None),
            Message.created_at >= now - timedelta(days=30),
        ).order_by(Message.created_at.desc())
    )
    latest_by_conv: dict[str, Message] = {}
    for m in result.scalars().all():
        latest_by_conv.setdefault(m.conversation_id, m)

    # Nomes dos clientes
    conv_ids = list(latest_by_conv.keys())
    lead_names: dict[str, tuple[str | None, str | None]] = {}
    if conv_ids:
        rows = await db.execute(
            select(Conversation.id, Lead.name, Lead.phone)
            .join(Lead, Lead.id == Conversation.customer_id, isouter=True)
            .where(Conversation.id.in_(conv_ids))
        )
        for cid, lname, lphone in rows.all():
            lead_names[cid] = (lname, lphone)

    pending, responded = [], []
    for conv_id, m in latest_by_conv.items():
        if mkt_names and m.template_name not in mkt_names:
            continue

        reply_result = await db.execute(
            select(Message).where(
                Message.conversation_id == conv_id,
                Message.direction == "inbound",
                Message.created_at > m.created_at,
            ).order_by(Message.created_at.asc()).limit(1)
        )
        reply = reply_result.scalar_one_or_none()

        name, phone = lead_names.get(conv_id, (None, None))
        base = {
            "conversation_id": conv_id,
            "customer_name": name or phone or "Sem nome",
            "phone": phone,
            "template_name": m.template_name,
            "sent_at": m.created_at.isoformat(),
        }
        if reply:
            responded.append({**base, "replied_at": reply.created_at.isoformat()})
        else:
            days = (now - m.created_at).days
            if FOLLOWUP_MIN_DAYS <= days <= FOLLOWUP_MAX_DAYS:
                pending.append({**base, "days_since": days})

    pending.sort(key=lambda x: x["days_since"], reverse=True)
    responded.sort(key=lambda x: x["replied_at"], reverse=True)
    return {"pending": pending, "responded": responded}


async def _get_or_create_conv_for_lead(tenant_id: str, lead_id: str, db: AsyncSession) -> Conversation:
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == lead_id,
            Conversation.status == "active",
        ).limit(1)
    )
    conv = result.scalar_one_or_none()
    if conv:
        return conv
    conv = Conversation(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        customer_id=lead_id,
        atendimento_status="aberto",
        status="active",
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    return conv


@router.get("/broadcast/audience")
async def broadcast_audience(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quantos leads têm número de telefone (público do disparo em massa)."""
    result = await db.execute(
        select(func.count(Lead.id)).where(
            Lead.account_id == current_user.tenant_id, Lead.phone.isnot(None)
        )
    )
    return {"count": result.scalar() or 0}


@router.post("/broadcast")
async def broadcast_template(
    body: BroadcastRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dispara um template para todos os leads que têm número de telefone."""
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem disparar em massa.")
    conn = await _get_conn_or_404(current_user.tenant_id, db)
    try:
        token = decrypt_token(conn.access_token_encrypted)
    except Exception:
        raise HTTPException(400, "Não foi possível ler as credenciais do WhatsApp. Reconecte o número.")

    q = select(Lead).where(
        Lead.account_id == current_user.tenant_id, Lead.phone.isnot(None)
    )
    if body.lead_ids:
        q = q.where(Lead.id.in_(body.lead_ids))
    leads = (await db.execute(q)).scalars().all()

    components = None
    if body.variables:
        components = [{
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in body.variables],
        }]

    sent, failed = 0, 0
    for lead in leads:
        to = lead.phone
        try:
            resp = await whatsapp_service.send_template(
                token, conn.phone_number_id, to,
                body.template_name, body.language, components,
            )
            wamid = (resp.get("messages") or [{}])[0].get("id")
            if not wamid:
                failed += 1
                logger.warning("Broadcast sem wamid para %s: %s", to, resp)
                continue
            conv = await _get_or_create_conv_for_lead(current_user.tenant_id, lead.id, db)
            await _save_outbound(
                tenant_id=current_user.tenant_id,
                conv_id=conv.id,
                sender=current_user.username,
                wa_to=to,
                text=f"[template:{body.template_name}] {' | '.join(body.variables)}",
                wamid=wamid,
                template_name=body.template_name,
                template_vars={"variables": body.variables},
                is_within_24h_window=False,
                db=db,
            )
            sent += 1
        except Exception as exc:
            failed += 1
            logger.warning("Broadcast falhou para %s: %s", to, exc)

    return {"total": len(leads), "sent": sent, "failed": failed}


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

async def _get_conn_or_404(tenant_id: str, db: AsyncSession) -> MetaConnection:
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == tenant_id,
            MetaConnection.provider == PROVIDER_WHATSAPP,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Conexão WhatsApp não configurada. Use PUT /whatsapp/credentials.")
    return conn


async def _save_outbound(
    *,
    tenant_id: str,
    conv_id: str | None,
    sender: str,
    wa_to: str,
    text: str | None,
    wamid: str | None,
    template_name: str | None = None,
    template_vars: dict | None = None,
    is_within_24h_window: bool = True,
    db: AsyncSession,
) -> None:
    """Persists an outbound message and broadcasts it via WebSocket."""
    if not conv_id:
        # Try to find active conversation for this recipient
        result = await db.execute(
            select(Conversation).where(
                Conversation.tenant_id == tenant_id,
                Conversation.status == "active",
            ).order_by(Conversation.last_updated.desc()).limit(1)
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv_id = conv.id

    if not conv_id:
        return  # No conversation context — skip saving

    msg = Message(
        tenant_id=tenant_id,
        conversation_id=conv_id,
        sender=sender,
        text=text,
        direction="outbound",
        wa_id=wa_to,
        status="sent",
        message_id=wamid,
        template_name=template_name,
        template_vars=template_vars,
        is_within_24h_window=is_within_24h_window,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    await ws_manager.broadcast(tenant_id, "new_message", {
        "id": msg.id,
        "conversation_id": conv_id,
        "sender": sender,
        "text": text,
        "direction": "outbound",
        "wa_id": wa_to,
        "status": "sent",
        "message_id": wamid,
        "template_name": template_name,
        "is_within_24h_window": is_within_24h_window,
        "created_at": msg.created_at.isoformat(),
    })
