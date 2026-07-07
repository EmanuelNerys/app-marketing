import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.ws_manager import ws_manager
from app.models.user import User
from app.models.conversation import Conversation
from app.models.lead import Lead
from app.models.meta_connection import MetaConnection, PROVIDER_WHATSAPP, STATUS_ACTIVE
from app.models.message import Message
from app.services.meta_token_service import decrypt_token
from app.services import whatsapp_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["conversations"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConversationOut(BaseModel):
    id: str
    tenant_id: str
    customer_id: str | None
    atendente_id: str | None
    atendimento_status: str
    status: str
    unread_count: int
    bot_active: bool = True
    customer_name: str | None = None
    last_updated: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class CreateConversationRequest(BaseModel):
    customer_id: str | None = None
    atendente_id: str | None = None
    atendimento_status: str = "aberto"


class UpdateConversationRequest(BaseModel):
    atendimento_status: str | None = None
    status: str | None = None
    atendente_id: str | None = None
    unread_count: int | None = None
    bot_active: bool | None = None


class StartConversationRequest(BaseModel):
    customer_wa_id: str
    customer_name: str | None = None
    template_name: str
    template_language: str = "pt_BR"
    template_variables: list[str] = []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/start", response_model=ConversationOut, status_code=201)
async def start_conversation_with_template(
    body: StartConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inicia conversa com template (sidebar). Cria lead, conversa e envia template."""
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas admins podem iniciar conversas com template.")

    wa_id = body.customer_wa_id

    # Upsert lead
    result = await db.execute(
        select(Lead).where(
            Lead.account_id == current_user.tenant_id,
            Lead.instagram_handle == wa_id,
        )
    )
    lead = result.scalar_one_or_none()
    if not lead:
        lead = Lead(
            id=str(uuid.uuid4()),
            account_id=current_user.tenant_id,
            instagram_handle=wa_id,
            name=body.customer_name or wa_id,
            source="manual",
            status="new",
        )
        db.add(lead)
        await db.flush()

    # Create conversation
    conv = Conversation(
        id=str(uuid.uuid4()),
        tenant_id=current_user.tenant_id,
        customer_id=lead.id,
        atendente_id=current_user.id,
        atendimento_status="em_atendimento",
        status="active",
    )
    db.add(conv)
    await db.flush()

    # Send template
    conn_result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_WHATSAPP,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = conn_result.scalar_one_or_none()
    if conn:
        token = decrypt_token(conn.access_token_encrypted)
        components = []
        if body.template_variables:
            components.append({
                "type": "body",
                "parameters": [{"type": "text", "text": v} for v in body.template_variables],
            })

        try:
            result = await whatsapp_service.send_template(
                token, conn.phone_number_id, wa_id,
                body.template_name, body.template_language, components or None,
            )
            wamid = result.get("messages", [{}])[0].get("id")

            msg = Message(
                tenant_id=current_user.tenant_id,
                conversation_id=conv.id,
                sender=current_user.username,
                text=f"[template:{body.template_name}] {' | '.join(body.template_variables)}",
                direction="outbound",
                wa_id=wa_id,
                status="sent",
                message_id=wamid,
                template_name=body.template_name,
                template_vars={"variables": body.template_variables},
                is_within_24h_window=False,
            )
            db.add(msg)
            await db.flush()

            await ws_manager.broadcast(current_user.tenant_id, "new_message", {
                "id": msg.id,
                "conversation_id": conv.id,
                "sender": current_user.username,
                "text": msg.text,
                "direction": "outbound",
                "wa_id": wa_id,
                "status": "sent",
                "message_id": wamid,
                "template_name": body.template_name,
                "created_at": msg.created_at.isoformat(),
            })
        except Exception as exc:
            logger.warning("Falha ao enviar template na abertura: %s", exc)

    await db.refresh(conv)
    await ws_manager.broadcast(current_user.tenant_id, "conversation_created", {
        "id": conv.id,
        "customer_id": lead.id,
        "atendimento_status": conv.atendimento_status,
        "status": conv.status,
    })
    return conv


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    status: str | None = Query(None),
    atendente_id: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Conversation).where(Conversation.tenant_id == current_user.tenant_id)
    if status:
        q = q.where(Conversation.status == status)
    if atendente_id:
        q = q.where(Conversation.atendente_id == atendente_id)
    q = q.order_by(desc(Conversation.last_updated)).limit(limit).offset(offset)

    result = await db.execute(q)
    convs = result.scalars().all()

    # Enriquece com o nome do cliente (lead)
    lead_ids = [c.customer_id for c in convs if c.customer_id]
    names: dict[str, str] = {}
    if lead_ids:
        lead_res = await db.execute(
            select(Lead.id, Lead.name, Lead.instagram_handle).where(Lead.id.in_(lead_ids))
        )
        for lid, lname, handle in lead_res.all():
            names[lid] = lname or handle

    out = []
    for c in convs:
        item = ConversationOut.model_validate(c)
        item.customer_name = names.get(c.customer_id) if c.customer_id else None
        out.append(item)
    return out


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    body: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = Conversation(
        id=str(uuid.uuid4()),
        tenant_id=current_user.tenant_id,
        customer_id=body.customer_id,
        atendente_id=body.atendente_id,
        atendimento_status=body.atendimento_status,
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)

    await ws_manager.broadcast(
        current_user.tenant_id,
        "conversation_created",
        ConversationOut.model_validate(conv).model_dump(),
    )
    return conv


@router.get("/{conv_id}", response_model=ConversationOut)
async def get_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_or_404(conv_id, current_user.tenant_id, db)
    return conv


@router.patch("/{conv_id}", response_model=ConversationOut)
async def update_conversation(
    conv_id: str,
    body: UpdateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_or_404(conv_id, current_user.tenant_id, db)

    if body.atendimento_status is not None:
        conv.atendimento_status = body.atendimento_status
    if body.status is not None:
        conv.status = body.status
    if body.atendente_id is not None:
        conv.atendente_id = body.atendente_id
    if body.unread_count is not None:
        conv.unread_count = body.unread_count
    if body.bot_active is not None:
        conv.bot_active = body.bot_active

    conv.last_updated = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(conv)

    await ws_manager.broadcast(
        current_user.tenant_id,
        "conversation_updated",
        ConversationOut.model_validate(conv).model_dump(),
    )
    return conv


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_or_404(conv_id, current_user.tenant_id, db)
    await db.delete(conv)


async def _get_or_404(conv_id: str, tenant_id: str, db: AsyncSession) -> Conversation:
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.tenant_id == tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return conv
