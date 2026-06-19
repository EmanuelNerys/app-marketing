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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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
    return result.scalars().all()


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
