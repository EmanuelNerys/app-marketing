"""
WhatsApp Business Cloud API routes.

Fluxo por tenant:
1. Admin configura credenciais (phone_number_id, waba_id, access_token)
2. Webhook recebe mensagens e roteia pelo phone_number_id
3. Agentes enviam texto/template pelo chat
4. Admin gerencia templates (criar, listar, sincronizar, deletar)
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.ws_manager import ws_manager
from app.models.user import User
from app.models.meta_connection import MetaConnection, PROVIDER_WHATSAPP, STATUS_ACTIVE
from app.models.conversation import Conversation
from app.models.message import Message
from app.services import whatsapp_service
from app.services.meta_token_service import encrypt_token, decrypt_token

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
# Credenciais — configuração manual por tenant
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
