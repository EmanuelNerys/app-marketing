import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.lead import Lead
from app.schemas import LeadResponse, LeadUpdate
from app.services.lead_scoring import score_lead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leads", tags=["leads"])


class DMSendRequest(BaseModel):
    lead_id: str
    message: str


@router.get("", response_model=List[LeadResponse])
async def list_leads(
    status: Optional[str] = Query(None),
    score_label: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Lead)
        .where(Lead.account_id == current_user.tenant_id)
        .order_by(Lead.captured_at.desc())
    )
    result = await db.execute(query)
    leads = result.scalars().all()

    if status:
        leads = [l for l in leads if l.status == status]
    if score_label:
        leads = [l for l in leads if l.score_label == score_label]
    if search:
        s = search.lower()
        leads = [
            l for l in leads
            if s in (l.name or "").lower()
            or s in (l.instagram_handle or "").lower()
            or s in (l.email or "").lower()
        ]

    return leads


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.account_id == current_user.tenant_id,
        )
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    return lead


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.account_id == current_user.tenant_id,
        )
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)

    await score_lead(lead)
    await db.flush()
    await db.refresh(lead)
    return lead


@router.post("/{lead_id}/score", response_model=LeadResponse)
async def score_lead_endpoint(
    lead_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recalcula o score de um lead específico."""
    result = await db.execute(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.account_id == current_user.tenant_id,
        )
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    await score_lead(lead)
    await db.flush()
    await db.refresh(lead)
    return lead


@router.post("/score-all", response_model=dict)
async def score_all_leads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recalcula o score de todos os leads da conta."""
    result = await db.execute(
        select(Lead).where(Lead.account_id == current_user.tenant_id)
    )
    leads = result.scalars().all()

    for lead in leads:
        await score_lead(lead)

    await db.flush()
    return {"scored": len(leads)}


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.account_id == current_user.tenant_id,
        )
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    await db.delete(lead)
    await db.flush()
    return {"detail": "Lead removido"}
