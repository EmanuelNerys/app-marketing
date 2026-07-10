import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.lead import Lead
from app.models.meta_connection import MetaConnection, PROVIDER_ADS, STATUS_ACTIVE
from app.services.meta_token_service import safe_decrypt_token
from app.services import ads_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/marketing", tags=["marketing"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AdAccountOut(BaseModel):
    id: str
    name: str
    account_status: int = 0
    currency: str = "BRL"
    business_name: str | None = None


class SwitchAdAccountRequest(BaseModel):
    ad_account_id: str = Field(..., description="ID no formato 'act_123' ou '123'")


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    objective: str = Field(default="OUTCOME_LEADS")
    status: str = Field(default="PAUSED")
    is_adset_budget_sharing_enabled: bool = Field(default=False)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, pattern="^(ACTIVE|PAUSED)$")
    daily_budget_cents: int | None = Field(default=None, ge=100)


class CampaignOut(BaseModel):
    id: str
    name: str
    status: str
    objective: str
    daily_budget: str | None = None
    lifetime_budget: str | None = None
    start_time: str | None = None
    stop_time: str | None = None


class TargetingSpec(BaseModel):
    age_min: int = Field(default=18, ge=13, le=65)
    age_max: int = Field(default=65, ge=13, le=65)
    genders: list[int] | None = Field(default=None, description="1=masculino, 2=feminino; omitir = todos")
    country_codes: list[str] = Field(default_factory=lambda: ["BR"])
    interest_ids: list[str] = Field(default_factory=list)


class AdSetCreate(BaseModel):
    campaign_id: str
    name: str = Field(..., min_length=1, max_length=255)
    daily_budget_cents: int = Field(default=1000, ge=100)
    bid_amount_cents: int | None = Field(default=None, ge=1)
    billing_event: str = Field(default="IMPRESSIONS")
    optimization_goal: str = Field(default="REACH")
    end_time: str | None = None
    targeting: TargetingSpec = Field(default_factory=TargetingSpec)


class AdSetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, pattern="^(ACTIVE|PAUSED)$")
    daily_budget_cents: int | None = Field(default=None, ge=100)
    bid_amount_cents: int | None = Field(default=None, ge=1)


class AdSetOut(BaseModel):
    id: str
    name: str
    status: str
    daily_budget: str | None = None
    lifetime_budget: str | None = None
    bid_amount: str | None = None
    billing_event: str | None = None
    optimization_goal: str | None = None
    end_time: str | None = None


class CarouselItem(BaseModel):
    image_url: str
    link_url: str | None = None
    message: str = ""


class AdCreativeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    video_id: Optional[str] = None
    video_thumb_url: Optional[str] = None
    carousel_items: list[CarouselItem] | None = Field(default=None, min_length=2, max_length=10)


class AdCreate(BaseModel):
    ad_set_id: str
    creative_id: str
    name: str = Field(..., min_length=1, max_length=255)
    status: str = Field(default="PAUSED")


class AdUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, pattern="^(ACTIVE|PAUSED)$")


class AdOut(BaseModel):
    id: str
    name: str
    status: str
    creative_id: str | None = None
    creative_name: str | None = None
    thumbnail_url: str | None = None


class AdInsightsOut(BaseModel):
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0
    cpm: float = 0.0


class InsightsPoint(BaseModel):
    date: str
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0


class TargetingOptionOut(BaseModel):
    id: str
    name: str
    audience_size: int | None = None
    type: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _require_ad_account(conn: MetaConnection) -> str:
    if not conn.ad_account_id:
        raise HTTPException(status_code=400, detail="Conta de anúncios não configurada.")
    return conn.ad_account_id


def _build_targeting(t: TargetingSpec) -> dict:
    targeting: dict = {
        "age_min": t.age_min,
        "age_max": t.age_max,
        "geo_locations": {"countries": t.country_codes or ["BR"]},
    }
    if t.genders:
        targeting["genders"] = t.genders
    if t.interest_ids:
        targeting["flexible_spec"] = [{"interests": [{"id": i} for i in t.interest_ids]}]
    return targeting


def _insights_row(item: dict) -> AdInsightsOut:
    return AdInsightsOut(
        spend=float(item.get("spend", 0) or 0),
        impressions=int(item.get("impressions", 0) or 0),
        clicks=int(item.get("clicks", 0) or 0),
        ctr=float(item.get("ctr", 0) or 0),
        cpm=float(item.get("cpm", 0) or 0),
    )


# ---------------------------------------------------------------------------
# Ad Accounts
# ---------------------------------------------------------------------------

@router.get("/ad-accounts", response_model=list[AdAccountOut])
async def api_list_ad_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    accounts = await ads_service.list_ad_accounts(token)
    return [
        AdAccountOut(
            id=a.get("id", ""),
            name=a.get("name", ""),
            account_status=a.get("account_status", 0),
            currency=a.get("currency", "BRL"),
            business_name=a.get("business_name"),
        )
        for a in accounts
    ]


@router.put("/ad-account")
async def api_switch_ad_account(
    body: SwitchAdAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Troca qual conta de anúncios este tenant usa (para quem tem mais de uma)."""
    conn, _ = await _get_ads_connection(current_user, db)
    conn.ad_account_id = body.ad_account_id
    await db.flush()
    return {"success": True, "ad_account_id": conn.ad_account_id}


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

@router.get("/campaigns", response_model=list[CampaignOut])
async def api_list_campaigns(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = _require_ad_account(conn)
    data = await ads_service.list_campaigns(token, ad_account_id)
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
    ad_account_id = _require_ad_account(conn)
    result = await ads_service.create_campaign(
        token, ad_account_id, body.name, body.objective, body.status,
        is_adset_budget_sharing_enabled=body.is_adset_budget_sharing_enabled,
    )
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar campanha: {result}")
    return {"success": True, "campaign_id": result["id"]}


@router.patch("/campaigns/{campaign_id}")
async def api_update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    fields: dict = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.status is not None:
        fields["status"] = body.status
    if body.daily_budget_cents is not None:
        fields["daily_budget"] = str(body.daily_budget_cents)
    if not fields:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    result = await ads_service.update_campaign(token, campaign_id, **fields)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao atualizar campanha."))
    return {"success": True}


@router.delete("/campaigns/{campaign_id}")
async def api_delete_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    result = await ads_service.delete_campaign(token, campaign_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao excluir campanha."))
    return {"success": True}


@router.get("/campaigns/{campaign_id}/insights", response_model=list[InsightsPoint])
async def api_campaign_insights(
    campaign_id: str,
    since: str | None = Query(None, description="YYYY-MM-DD"),
    until: str | None = Query(None, description="YYYY-MM-DD"),
    date_preset: str = Query("last_30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Série temporal (1 ponto por dia) para o gráfico de gastos da campanha."""
    _, token = await _get_ads_connection(current_user, db)
    data = await ads_service.get_insights(
        token, campaign_id, date_preset=date_preset, since=since, until=until,
        time_increment=1, fields="spend,impressions,clicks,date_start",
    )
    return [
        InsightsPoint(
            date=item.get("date_start", ""),
            spend=float(item.get("spend", 0) or 0),
            impressions=int(item.get("impressions", 0) or 0),
            clicks=int(item.get("clicks", 0) or 0),
        )
        for item in data
    ]


@router.get("/campaigns/{campaign_id}/ad-sets", response_model=list[AdSetOut])
async def api_list_ad_sets(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    data = await ads_service.list_ad_sets(token, campaign_id)
    return [
        AdSetOut(
            id=a.get("id", ""),
            name=a.get("name", ""),
            status=a.get("status", ""),
            daily_budget=a.get("daily_budget"),
            lifetime_budget=a.get("lifetime_budget"),
            bid_amount=a.get("bid_amount"),
            billing_event=a.get("billing_event"),
            optimization_goal=a.get("optimization_goal"),
            end_time=a.get("end_time"),
        )
        for a in data
    ]


# ---------------------------------------------------------------------------
# Ad Sets
# ---------------------------------------------------------------------------

@router.post("/ad-sets")
async def api_create_ad_set(
    body: AdSetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = _require_ad_account(conn)
    result = await ads_service.create_ad_set(
        token, ad_account_id, body.campaign_id, body.name, body.daily_budget_cents,
        billing_event=body.billing_event, optimization_goal=body.optimization_goal,
        targeting=_build_targeting(body.targeting),
        bid_amount=body.bid_amount_cents, end_time=body.end_time,
    )
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar conjunto: {result}")
    return {"success": True, "ad_set_id": result["id"]}


@router.patch("/ad-sets/{ad_set_id}")
async def api_update_ad_set(
    ad_set_id: str,
    body: AdSetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    fields: dict = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.status is not None:
        fields["status"] = body.status
    if body.daily_budget_cents is not None:
        fields["daily_budget"] = str(body.daily_budget_cents)
    if body.bid_amount_cents is not None:
        fields["bid_amount"] = str(body.bid_amount_cents)
    if not fields:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    result = await ads_service.update_ad_set(token, ad_set_id, **fields)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao atualizar conjunto."))
    return {"success": True}


@router.delete("/ad-sets/{ad_set_id}")
async def api_delete_ad_set(
    ad_set_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    result = await ads_service.delete_ad_set(token, ad_set_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao excluir conjunto."))
    return {"success": True}


@router.get("/ad-sets/{ad_set_id}/ads", response_model=list[AdOut])
async def api_list_ads(
    ad_set_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    data = await ads_service.list_ads(token, ad_set_id)
    out = []
    for a in data:
        creative = a.get("creative", {}) or {}
        out.append(AdOut(
            id=a.get("id", ""),
            name=a.get("name", ""),
            status=a.get("status", ""),
            creative_id=creative.get("id"),
            creative_name=creative.get("name"),
            thumbnail_url=creative.get("thumbnail_url"),
        ))
    return out


# ---------------------------------------------------------------------------
# Creatives & Ads
# ---------------------------------------------------------------------------

@router.post("/videos/upload")
async def api_upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sobe um vídeo para a conta de anúncios — necessário antes de criar um criativo de vídeo."""
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = _require_ad_account(conn)

    content = await file.read()
    if len(content) > 300 * 1024 * 1024:
        raise HTTPException(413, "Vídeo excede o limite de 300 MB.")

    result = await ads_service.upload_ad_video(token, ad_account_id, content, file.filename or "video.mp4")
    video_id = result.get("id")
    if not video_id:
        raise HTTPException(502, result.get("error", {}).get("message", "Falha no upload do vídeo."))
    return {"video_id": video_id}


@router.post("/creatives")
async def api_create_creative(
    body: AdCreativeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = _require_ad_account(conn)
    page_id = conn.page_id or ""
    if not page_id:
        raise HTTPException(
            status_code=400,
            detail="Página do Facebook não configurada nesta conexão de anúncios.",
        )
    result = await ads_service.create_ad_creative(
        token, ad_account_id, body.name, page_id, body.message,
        image_url=body.image_url, link_url=body.link_url,
        video_id=body.video_id, video_thumb_url=body.video_thumb_url,
        carousel_items=[i.model_dump() for i in body.carousel_items] if body.carousel_items else None,
    )
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
    ad_account_id = _require_ad_account(conn)
    result = await ads_service.create_ad(token, ad_account_id, body.ad_set_id, body.creative_id, body.name, body.status)
    if "id" not in result:
        raise HTTPException(status_code=400, detail=f"Erro ao criar anúncio: {result}")
    return {"success": True, "ad_id": result["id"]}


@router.patch("/ads/{ad_id}")
async def api_update_ad(
    ad_id: str,
    body: AdUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    fields: dict = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.status is not None:
        fields["status"] = body.status
    if not fields:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    result = await ads_service.update_ad(token, ad_id, **fields)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao atualizar anúncio."))
    return {"success": True}


@router.delete("/ads/{ad_id}")
async def api_delete_ad(
    ad_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    result = await ads_service.delete_ad(token, ad_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"].get("message", "Erro ao excluir anúncio."))
    return {"success": True}


# ---------------------------------------------------------------------------
# Targeting search (autocomplete)
# ---------------------------------------------------------------------------

@router.get("/targeting/interests", response_model=list[TargetingOptionOut])
async def api_search_interests(
    q: str = Query(..., min_length=2),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    data = await ads_service.search_interests(token, q)
    return [
        TargetingOptionOut(id=i.get("id", ""), name=i.get("name", ""), audience_size=i.get("audience_size"))
        for i in data
    ]


@router.get("/targeting/locations", response_model=list[TargetingOptionOut])
async def api_search_locations(
    q: str = Query(..., min_length=2),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, token = await _get_ads_connection(current_user, db)
    data = await ads_service.search_geo_locations(token, q)
    return [
        TargetingOptionOut(id=i.get("key", i.get("id", "")), name=i.get("name", ""), type=i.get("type"))
        for i in data
    ]


# ---------------------------------------------------------------------------
# Account-level insights
# ---------------------------------------------------------------------------

@router.get("/insights", response_model=AdInsightsOut)
async def api_insights(
    since: str | None = Query(None, description="YYYY-MM-DD"),
    until: str | None = Query(None, description="YYYY-MM-DD"),
    date_preset: str = Query("last_30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn, token = await _get_ads_connection(current_user, db)
    ad_account_id = _require_ad_account(conn)
    data = await ads_service.get_account_insights(
        token, ad_account_id, date_preset=date_preset, since=since, until=until,
    )
    if not data:
        return AdInsightsOut()
    return _insights_row(data[0])


# ---------------------------------------------------------------------------
# Atribuição — leads gerados por anúncio (CTWA, IG Direct e Lead Ads)
# ---------------------------------------------------------------------------

class AdAttributionOut(BaseModel):
    ad_id: str
    ad_name: str | None = None
    leads: int


class AttributionSummaryOut(BaseModel):
    total_leads: int
    leads_from_ads: int
    by_ad: list[AdAttributionOut]


@router.get("/attribution", response_model=AttributionSummaryOut)
async def api_attribution(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Quantos leads cada anúncio gerou — cruzando os leads capturados
    (Click-to-WhatsApp, referral do Direct e formulários de Lead Ads) com o
    ID do anúncio de origem. É o ROI real: conversas/leads, não cliques.
    """
    total = (await db.execute(
        select(func.count(Lead.id)).where(Lead.account_id == current_user.tenant_id)
    )).scalar() or 0

    rows = (await db.execute(
        select(Lead.origin_ad_id, func.count(Lead.id))
        .where(
            Lead.account_id == current_user.tenant_id,
            Lead.origin_ad_id.isnot(None),
        )
        .group_by(Lead.origin_ad_id)
        .order_by(func.count(Lead.id).desc())
        .limit(50)
    )).all()

    # Enriquece com os nomes dos anúncios (melhor esforço — sem conexão de
    # Ads ativa, mostra só o ID)
    ad_names: dict[str, str] = {}
    if rows:
        try:
            _, token = await _get_ads_connection(current_user, db)
            ad_names = await ads_service.get_ad_names(token, [r[0] for r in rows])
        except HTTPException:
            pass
        except Exception as exc:
            logger.debug("Não foi possível resolver nomes de anúncios: %s", exc)

    by_ad = [
        AdAttributionOut(ad_id=ad_id, ad_name=ad_names.get(ad_id), leads=count)
        for ad_id, count in rows
    ]
    return AttributionSummaryOut(
        total_leads=total,
        leads_from_ads=sum(a.leads for a in by_ad),
        by_ad=by_ad,
    )
