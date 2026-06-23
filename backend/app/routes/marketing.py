import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.meta_connection import MetaConnection, PROVIDER_ADS, STATUS_ACTIVE
from app.services.meta_token_service import safe_decrypt_token
from app.services.ads_service import (
    list_campaigns,
    create_campaign,
    create_ad_set,
    create_ad_creative,
    create_ad,
    get_account_insights,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/marketing", tags=["marketing"])


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    objective: str = Field(default="OUTCOME_LEADS")
    status: str = Field(default="PAUSED")


class CampaignOut(BaseModel):
    id: str
    name: str
    status: str
    objective: str
    daily_budget: str | None = None
    lifetime_budget: str | None = None
    start_time: str | None = None
    stop_time: str | None = None


class AdSetCreate(BaseModel):
    campaign_id: str
    name: str = Field(..., min_length=1, max_length=255)
    daily_budget_cents: int = Field(default=1000, ge=100)


class AdCreativeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    image_url: Optional[str] = None
    link_url: Optional[str] = None


class AdCreate(BaseModel):
    ad_set_id: str
    creative_id: str
    name: str = Field(..., min_length=1, max_length=255)
    status: str = Field(default="PAUSED")


class AdInsightsOut(BaseModel):
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0
    cpm: float = 0.0


async def _get_ads_connection(
    current_user: User, db: AsyncSession
) -> tuple[MetaConnection, str]:
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_ADS,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma conta de anúncios conectada. Conecte pelo onboarding.",
        )
    token = safe_decrypt_token(conn.access_token_encrypted)
    if not token:
        raise HTTPException(status_code=400, detail="Token de acesso inválido ou expirado.")
    return conn, token


@router.get("/campaigns", response_model=list[CampaignOut])
async def api_list_campaigns(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    data = await list_campaigns(token, ad_account_id)
    return [
        CampaignOut(
            id=c.get("id", ""),
            name=c.get("name", ""),
            status=c.get("status", ""),
            objective=c.get("objective", ""),
            daily_budget=c.get("daily_budget"),
            lifetime_budget=c.get("lifetime_budget"),
            start_time=c.get("start_time"),
            stop_time=c.get("stop_time"),
        )
        for c in data
    ]


@router.post("/campaigns")
async def api_create_campaign(
    body: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    result = await create_campaign(token, ad_account_id, body.name, body.objective, body.status)
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar campanha: {result}")
    return {"success": True, "campaign_id": result["id"]}


@router.post("/ad-sets")
async def api_create_ad_set(
    body: AdSetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    result = await create_ad_set(token, ad_account_id, body.campaign_id, body.name, body.daily_budget_cents)
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar conjunto: {result}")
    return {"success": True, "ad_set_id": result["id"]}


@router.post("/creatives")
async def api_create_creative(
    body: AdCreativeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    page_id = conn.page_id or ""
    if not ad_account_id or not page_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios ou página não configurada.")
    result = await create_ad_creative(token, ad_account_id, body.name, page_id, body.message, body.image_url, body.link_url)
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar criativo: {result}")
    return {"success": True, "creative_id": result["id"]}


@router.post("/ads")
async def api_create_ad(
    body: AdCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    result = await create_ad(token, ad_account_id, body.ad_set_id, body.creative_id, body.name, body.status)
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar anúncio: {result}")
    return {"success": True, "ad_id": result["id"]}


@router.get("/insights", response_model=AdInsightsOut)
async def api_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = conn.ad_account_id or ""
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    data = await get_account_insights(token, ad_account_id)
    if not data:
        return AdInsightsOut()
    item = data[0]
    return AdInsightsOut(
        spend=float(item.get("spend", 0)),
        impressions=int(item.get("impressions", 0)),
        clicks=int(item.get("clicks", 0)),
        ctr=float(item.get("ctr", 0)),
        cpm=float(item.get("cpm", 0)),
    )
