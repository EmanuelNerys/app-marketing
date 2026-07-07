import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.ws_manager import ws_manager
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.lead import Lead
from app.models.meta_connection import MetaConnection, PROVIDER_WHATSAPP, STATUS_ACTIVE
from app.services.meta_token_service import decrypt_token
from app.services import whatsapp_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations/{conv_id}/messages", tags=["messages"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MessageOut(BaseModel):
    id: int
    tenant_id: str
    conversation_id: str
    sender: str
    text: str | None
    direction: str
    wa_id: str | None
    status: str
    message_id: str | None
    media_type: str | None
    media_url: str | None
    context_text: str | None
    meta_category: str | None
    meta_cost: float | None
    is_within_24h_window: bool
    template_vars: dict | None
    template_name: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    text: str | None = None
    direction: str = "outbound"
    sender: str | None = None
    wa_id: str | None = None
    media_type: str | None = None
    media_url: str | None = None
    template_name: str | None = None
    template_vars: dict | None = None
    message_id: str | None = None
    payload: dict | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[MessageOut])
async def list_messages(
    conv_id: str,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_conv_access(conv_id, current_user.tenant_id, db)

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id, Message.tenant_id == current_user.tenant_id)
        .order_by(asc(Message.created_at))
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("", response_model=MessageOut, status_code=201)
async def send_message(
    conv_id: str,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_conv(conv_id, current_user.tenant_id, db)

    sender = body.sender or current_user.username
    status = "sent"
    message_id = body.message_id
    wa_id = body.wa_id

    # Envio real via WhatsApp Cloud API (apenas mensagens outbound).
    if body.direction == "outbound":
        # Destinatário: wa_id do body ou o handle do lead (o webhook grava o wa_id ali).
        if not wa_id and conv.customer_id:
            lead = await db.get(Lead, conv.customer_id)
            wa_id = lead.instagram_handle if lead else None

        conn = (
            await db.execute(
                select(MetaConnection).where(
                    MetaConnection.account_id == current_user.tenant_id,
                    MetaConnection.provider == PROVIDER_WHATSAPP,
                    MetaConnection.status == STATUS_ACTIVE,
                )
            )
        ).scalar_one_or_none()

        if conn and wa_id and (body.text or body.media_url):
            try:
                token = decrypt_token(conn.access_token_encrypted)
                if body.media_type and body.media_url:
                    resp = await whatsapp_service.send_media(
                        token, conn.phone_number_id, wa_id,
                        body.media_type, body.media_url, body.text,
                    )
                else:
                    resp = await whatsapp_service.send_text(
                        token, conn.phone_number_id, wa_id, body.text or "",
                    )
                sent_id = (resp.get("messages") or [{}])[0].get("id")
                if sent_id:
                    message_id = sent_id
                else:
                    status = "failed"
                    logger.warning("Envio WhatsApp sem wamid (conv=%s): %s", conv_id, resp)
            except Exception as exc:
                status = "failed"
                logger.warning("Falha ao enviar WhatsApp (conv=%s): %s", conv_id, exc)
        elif not conn:
            logger.info(
                "Sem conexão WhatsApp ativa — mensagem apenas armazenada (conv=%s)", conv_id
            )

    msg = Message(
        tenant_id=current_user.tenant_id,
        conversation_id=conv_id,
        sender=sender,
        text=body.text,
        direction=body.direction,
        wa_id=wa_id,
        status=status,
        message_id=message_id,
        media_type=body.media_type,
        media_url=body.media_url,
        template_name=body.template_name,
        template_vars=body.template_vars,
        payload=body.payload,
    )
    db.add(msg)
    await db.flush()

    # Toca a conversa (ordena no topo da lista)
    conv.last_updated = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(msg)

    await ws_manager.broadcast(
        current_user.tenant_id,
        "new_message",
        MessageOut.model_validate(msg).model_dump(),
    )
    return msg


@router.patch("/{msg_id}/status", response_model=MessageOut)
async def update_message_status(
    conv_id: str,
    msg_id: int,
    new_status: str = Query(..., pattern="^(sent|delivered|read|failed)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_conv_access(conv_id, current_user.tenant_id, db)

    result = await db.execute(
        select(Message).where(Message.id == msg_id, Message.conversation_id == conv_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    msg.status = new_status
    await db.flush()
    await db.refresh(msg)

    await ws_manager.broadcast(
        current_user.tenant_id,
        "message_status_updated",
        {"id": msg.id, "status": msg.status, "conversation_id": conv_id},
    )
    return msg


async def _get_conv(conv_id: str, tenant_id: str, db: AsyncSession) -> Conversation:
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id, Conversation.tenant_id == tenant_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return conv


async def _assert_conv_access(conv_id: str, tenant_id: str, db: AsyncSession) -> None:
    await _get_conv(conv_id, tenant_id, db)
