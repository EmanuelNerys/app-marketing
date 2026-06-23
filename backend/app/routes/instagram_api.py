import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User
from app.models.meta_connection import (
    MetaConnection,
    PROVIDER_INSTAGRAM,
    STATUS_ACTIVE,
)
from app.models.schedule import PostSchedule
from app.schemas.schedule import (
    ScheduleCreate, ScheduleUpdate, ScheduleResponse,
    PublishMediaRequest, PublishMediaResponse,
    InstagramMediaResponse, InstagramInsightsResponse,
)
from app.services.instagram_service import (
    publish_image_post, publish_video_post, list_media,
    TokenExpiredError,
)
from app.services.meta_token_service import decrypt_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/instagram", tags=["instagram-api"])


async def _get_ig_connection(
    db: AsyncSession,
    current_user: User,
    ig_user_id: str | None = None,
) -> tuple[MetaConnection, str, str]:
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_INSTAGRAM,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=400, detail="Instagram não conectado. Conecte-se primeiro.")

    try:
        token = decrypt_token(conn.access_token_encrypted)
    except Exception:
        raise HTTPException(status_code=400, detail="Erro ao descriptografar token. Reconecte o Instagram.")

    ig_id = ig_user_id or conn.ig_business_account_id or conn.meta_user_id
    if not ig_id:
        raise HTTPException(status_code=400, detail="Instagram Business ID não encontrado. Informe o ig_user_id na requisição.")

    return conn, token, ig_id


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/profile")
async def get_instagram_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.ig_graph_url}/{ig_id}",
            params={
                "fields": "id,username,name,account_type,followers_count,media_count,profile_picture_url",
                "access_token": token,
            },
        )
    data = resp.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "Erro ao buscar perfil"))
    return data


# ---------------------------------------------------------------------------
# Publish media (image or video)
# ---------------------------------------------------------------------------

@router.post("/publish", response_model=PublishMediaResponse)
async def publish_media(
    body: PublishMediaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user, body.ig_user_id)

    caption = body.caption or ""
    if body.hashtags:
        caption += f"\n\n{body.hashtags}"

    try:
        if body.media_type.upper() == "VIDEO":
            result = await publish_video_post(token, ig_id, body.media_url, caption)
        else:
            result = await publish_image_post(token, ig_id, body.media_url, caption)

        media_id = result.get("id")
        logger.info("Published media %s for account %s", media_id, current_user.tenant_id)
        return PublishMediaResponse(success=True, media_id=media_id, message="Publicado com sucesso!")

    except TokenExpiredError as e:
        raise HTTPException(status_code=401, detail=f"Token expirado: {e}. Reconecte o Instagram.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Publish failed: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao publicar. Tente novamente.")


# ---------------------------------------------------------------------------
# Schedule a post
# ---------------------------------------------------------------------------

@router.post("/schedule", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user, body.ig_user_id)

    scheduled_for = body.scheduled_for or (datetime.now(timezone.utc) + timedelta(hours=1))

    schedule = PostSchedule(
        account_id=current_user.tenant_id,
        ig_user_id=ig_id,
        media_type=body.media_type.upper(),
        media_url=body.media_url,
        caption=body.caption,
        hashtags=body.hashtags,
        thumbnail_url=body.thumbnail_url,
        scheduled_for=scheduled_for,
        status="scheduled",
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.get("/schedule", response_model=list[ScheduleResponse])
async def list_schedules(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PostSchedule).where(
        PostSchedule.account_id == current_user.tenant_id
    )
    if status:
        query = query.where(PostSchedule.status == status)
    query = query.order_by(desc(PostSchedule.scheduled_for))

    result = await db.execute(query)
    return result.scalars().all()


@router.put("/schedule/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: str,
    body: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PostSchedule).where(
            PostSchedule.id == schedule_id,
            PostSchedule.account_id == current_user.tenant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")

    if body.caption is not None:
        schedule.caption = body.caption
    if body.hashtags is not None:
        schedule.hashtags = body.hashtags
    if body.scheduled_for is not None:
        schedule.scheduled_for = body.scheduled_for
    if body.status is not None:
        schedule.status = body.status

    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.delete("/schedule/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PostSchedule).where(
            PostSchedule.id == schedule_id,
            PostSchedule.account_id == current_user.tenant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")

    await db.delete(schedule)
    return {"success": True}


@router.post("/schedule/{schedule_id}/publish-now", response_model=PublishMediaResponse)
async def publish_scheduled_now(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PostSchedule).where(
            PostSchedule.id == schedule_id,
            PostSchedule.account_id == current_user.tenant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")

    conn, token, ig_id = await _get_ig_connection(db, current_user, schedule.ig_user_id)

    caption = schedule.caption or ""
    if schedule.hashtags:
        caption += f"\n\n{schedule.hashtags}"

    try:
        if schedule.media_type == "VIDEO":
            result = await publish_video_post(token, ig_id, schedule.media_url, caption)
        else:
            result = await publish_image_post(token, ig_id, schedule.media_url, caption)

        media_id = result.get("id")
        schedule.status = "published"
        schedule.published_at = datetime.now(timezone.utc)
        schedule.media_id_response = media_id
        await db.flush()

        return PublishMediaResponse(success=True, media_id=media_id, message="Publicado com sucesso!")

    except TokenExpiredError as e:
        schedule.status = "failed"
        schedule.error_message = str(e)
        await db.flush()
        raise HTTPException(status_code=401, detail=f"Token expirado: {e}. Reconecte o Instagram.")
    except Exception as e:
        schedule.status = "failed"
        schedule.error_message = str(e)
        schedule.retry_count = (schedule.retry_count or 0) + 1
        await db.flush()
        raise HTTPException(status_code=500, detail=f"Erro ao publicar: {e}")


# ---------------------------------------------------------------------------
# List media from Instagram
# ---------------------------------------------------------------------------

@router.get("/media", response_model=list[InstagramMediaResponse])
async def get_media(
    ig_user_id: str | None = Query(None),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user, ig_user_id)

    try:
        media_list = await list_media(token, ig_id, limit)
    except TokenExpiredError as e:
        raise HTTPException(status_code=401, detail=f"Token expirado: {e}. Reconecte o Instagram.")
    except Exception as e:
        logger.error("list_media failed: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao listar mídias.")

    result = []
    for m in media_list:
        ts = None
        if m.get("timestamp"):
            try:
                ts = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        result.append(InstagramMediaResponse(
            id=m["id"],
            media_type=m.get("media_type", ""),
            media_url=m.get("media_url"),
            thumbnail_url=m.get("thumbnail_url"),
            caption=m.get("caption"),
            timestamp=ts,
            like_count=m.get("like_count", 0),
            comments_count=m.get("comments_count", 0),
        ))
    return result


# ---------------------------------------------------------------------------
# Instagram Insights / Metrics
# ---------------------------------------------------------------------------

@router.get("/insights", response_model=InstagramInsightsResponse)
async def get_insights(
    ig_user_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user, ig_user_id)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            user_resp = await client.get(
                f"{settings.ig_graph_url}/{ig_id}",
                params={
                    "access_token": token,
                    "fields": "id,username,name,followers_count,follows_count,media_count,profile_picture_url",
                },
            )
            user_data = user_resp.json()
            logger.info("IG user data: %s", user_data)

            insights_resp = await client.get(
                f"{settings.ig_graph_url}/{ig_id}/insights",
                params={
                    "access_token": token,
                    "metric": "reach,impressions,profile_views,website_clicks,email_contacts,phone_call_clicks,get_direction_clicks",
                    "period": "day",
                    "since": (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d"),
                    "until": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                },
            )
            insights_data = insights_resp.json()
            logger.info("IG insights: %s", insights_data)

    except Exception as e:
        logger.error("Failed to fetch IG insights: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao buscar métricas do Instagram.")

    followers = user_data.get("followers_count", 0) or 0
    follows = user_data.get("follows_count", 0) or 0
    media_count = user_data.get("media_count", 0) or 0

    metrics = {
        "reach": 0, "impressions": 0, "profile_views": 0,
        "website_clicks": 0, "email_contacts": 0,
        "phone_call_clicks": 0, "get_direction_clicks": 0,
    }

    for item in insights_data.get("data", []):
        name = item.get("name")
        total = sum(v.get("value", 0) for v in item.get("values", []) if isinstance(v.get("value"), (int, float)))
        if name in metrics:
            metrics[name] = int(total)

    engagement = 0
    if followers > 0 and metrics["reach"] > 0:
        engagement = round((metrics["reach"] / followers) * 100, 2)

    return InstagramInsightsResponse(
        followers_count=followers,
        follows_count=follows,
        media_count=media_count,
        profile_views=metrics["profile_views"],
        reach=metrics["reach"],
        impressions=metrics["impressions"],
        engagement=engagement,
        website_clicks=metrics["website_clicks"],
        email_contacts=metrics["email_contacts"],
        phone_call_clicks=metrics["phone_call_clicks"],
        get_direction_clicks=metrics["get_direction_clicks"],
        followers_delta=followers,
        profile_views_delta=metrics["profile_views"],
    )


# ---------------------------------------------------------------------------
# IG Stories insights
# ---------------------------------------------------------------------------

@router.get("/stories-insights")
async def get_stories_insights(
    ig_user_id: str | None = Query(None),
    limit: int = Query(10, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn, token, ig_id = await _get_ig_connection(db, current_user, ig_user_id)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            stories_resp = await client.get(
                f"{settings.ig_graph_url}/{ig_id}/stories",
                params={
                    "access_token": token,
                    "fields": "id,media_type,media_url,thumbnail_url,timestamp",
                    "limit": str(limit),
                },
            )
            stories_data = stories_resp.json()
            stories = stories_data.get("data", [])

            results = []
            for story in stories:
                story_id = story["id"]
                insights = await client.get(
                    f"{settings.ig_graph_url}/{story_id}/insights",
                    params={
                        "access_token": token,
                        "metric": "reach,impressions,exits,replies,taps_forward,taps_back",
                    },
                )
                ins_data = insights.json()
                ins_map = {}
                for item in ins_data.get("data", []):
                    vals = item.get("values", [{}])
                    ins_map[item["name"]] = vals[0].get("value", 0) if vals else 0

                ts = story.get("timestamp")
                if ts:
                    try:
                        ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        ts = None

                results.append({
                    "id": story_id,
                    "media_type": story.get("media_type"),
                    "media_url": story.get("media_url"),
                    "thumbnail_url": story.get("thumbnail_url"),
                    "timestamp": ts.isoformat() if ts else None,
                    "reach": ins_map.get("reach", 0),
                    "impressions": ins_map.get("impressions", 0),
                    "exits": ins_map.get("exits", 0),
                    "replies": ins_map.get("replies", 0),
                    "taps_forward": ins_map.get("taps_forward", 0),
                    "taps_back": ins_map.get("taps_back", 0),
                })

            return {"stories": results}

    except Exception as e:
        logger.error("Failed to fetch IG stories: %s", e)
        raise HTTPException(status_code=500, detail="Erro ao buscar stories.")


# ---------------------------------------------------------------------------
# Update IG Business ID manually
# ---------------------------------------------------------------------------

from pydantic import BaseModel


class UpdateIgIdRequest(BaseModel):
    ig_business_account_id: str


@router.put("/connection/ig-id")
async def update_ig_business_id(
    body: UpdateIgIdRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_INSTAGRAM,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=400, detail="Instagram não conectado.")

    conn.ig_business_account_id = body.ig_business_account_id
    await db.flush()
    return {"success": True, "ig_business_account_id": body.ig_business_account_id}


class SendDMRequest(BaseModel):
    recipient_ig_user_id: str
    message: str
    lead_id: str | None = None


@router.post("/dm/send")
async def send_instagram_dm(
    body: SendDMRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Envia uma DM para um usuário do Instagram via Graph API."""
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == current_user.tenant_id,
            MetaConnection.provider == PROVIDER_INSTAGRAM,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=400, detail="Instagram não conectado.")

    if not conn.ig_business_account_id:
        raise HTTPException(
            status_code=400,
            detail="ID da conta Instagram Business não configurado.",
        )

    token = decrypt_token(conn.access_token_encrypted)
    ig_biz_id = conn.ig_business_account_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.ig_graph_url}/{ig_biz_id}/messages",
            json={
                "recipient": {"id": body.recipient_ig_user_id},
                "message": {"text": body.message},
            },
            params={"access_token": token},
        )

    if not resp.is_success:
        error_detail = resp.json().get("error", {}).get("message", resp.text)
        logger.error("Erro ao enviar DM Instagram: %s", resp.text)
        raise HTTPException(status_code=400, detail=f"Erro ao enviar DM: {error_detail}")

    # Atualiza o status do lead para 'contacted' se lead_id fornecido
    if body.lead_id:
        from app.models.lead import Lead, LeadStatus
        from sqlalchemy import select as sa_select
        lead_result = await db.execute(
            sa_select(Lead).where(
                Lead.id == body.lead_id,
                Lead.account_id == current_user.tenant_id,
            )
        )
        lead = lead_result.scalar_one_or_none()
        if lead and lead.status == LeadStatus.NEW:
            lead.status = LeadStatus.CONTACTED
            await db.flush()

    return {"status": "sent", "message_id": resp.json().get("message_id")}
