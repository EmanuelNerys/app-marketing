import logging
import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account
from app.services.meta_token_service import safe_decrypt_token
from app.models.lead import Lead
from app.models.automation import Customer, Sale
from app.models.video import VideoGeneration, CreditUsage, Alert
from app.schemas import (
    DashboardResponse, PerformancePoint, RecentActivity, AlertResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])

META_GRAPH_URL = "https://graph.facebook.com/v21.0"


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    account_id: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    total_leads_result = await db.execute(select(func.count(Lead.id)))
    total_leads = total_leads_result.scalar() or 0

    total_customers_result = await db.execute(select(func.count(Customer.id)))
    total_customers = total_customers_result.scalar() or 0

    new_customers_result = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= thirty_days_ago)
    )
    new_customers_30d = new_customers_result.scalar() or 0

    conversion_rate = (total_customers / total_leads * 100) if total_leads > 0 else 0.0

    total_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Sale.amount), 0)).where(Sale.status == "completed")
    )
    total_revenue = float(total_revenue_result.scalar() or 0)

    monthly_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Sale.amount), 0)).where(
            Sale.status == "completed", Sale.sold_at >= thirty_days_ago
        )
    )
    monthly_revenue = float(monthly_revenue_result.scalar() or 0)

    total_sales_result = await db.execute(
        select(func.count(Sale.id)).where(Sale.status == "completed")
    )
    total_sales = total_sales_result.scalar() or 0
    average_ticket = (total_revenue / total_sales) if total_sales > 0 else 0.0
    projected_revenue = monthly_revenue * 12 if monthly_revenue > 0 else 0.0

    ads_spent = 0.0
    ads_impressions = 0
    ads_clicks = 0
    ads_ctr = 0.0
    ads_cpm = 0.0
    ads_roas = 0.0
    performance_data = []
    instagram_posts = 0
    instagram_reach = 0
    instagram_engagement = 0.0
    instagram_followers_delta = 0

    if account_id:
        result = await db.execute(select(Account).where(Account.id == account_id))
        account = result.scalar_one_or_none()

        if account and account.meta_access_token:
            token = safe_decrypt_token(account.meta_access_token)
            page_id = account.meta_page_id

            async with httpx.AsyncClient() as client:
                try:
                    insights_resp = await client.get(
                        f"{META_GRAPH_URL}/{page_id}/insights",
                        params={
                            "access_token": token,
                            "metric": "impressions,reach,engaged_users",
                            "period": "days_28",
                        },
                    )
                    insights_data = insights_resp.json()
                    logger.info("Instagram insights: %s", insights_data)

                    for item in insights_data.get("data", []):
                        name = item.get("name")
                        value = item.get("values", [{}])[0].get("value", 0)
                        if name == "impressions":
                            instagram_reach = value
                        elif name == "engaged_users":
                            instagram_engagement = float(value)

                    followers_resp = await client.get(
                        f"{META_GRAPH_URL}/{page_id}",
                        params={
                            "access_token": token,
                            "fields": "followers_count",
                        },
                    )
                    followers_data = followers_resp.json()
                    logger.info("Followers: %s", followers_data)
                    instagram_followers_delta = followers_data.get("followers_count", 0)

                    posts_resp = await client.get(
                        f"{META_GRAPH_URL}/{page_id}/posts",
                        params={
                            "access_token": token,
                            "fields": "id,created_time",
                            "limit": "100",
                            "since": str(int(thirty_days_ago.timestamp())),
                        },
                    )
                    posts_data = posts_resp.json()
                    instagram_posts = len(posts_data.get("data", []))

                    ad_accounts_resp = await client.get(
                        f"{META_GRAPH_URL}/{page_id}/adaccounts",
                        params={
                            "access_token": token,
                            "fields": "id",
                            "limit": "5",
                        },
                    )
                    ad_accounts_data = ad_accounts_resp.json()
                    ad_account_ids = [
                        a["id"] for a in ad_accounts_data.get("data", [])
                    ]

                    if ad_account_ids:
                        account_id_filter = ",".join(
                            f"act_{a.split('_')[-1]}" if "act_" in a else a
                            for a in ad_account_ids
                        )

                        insights_params = {
                            "access_token": token,
                            "level": "account",
                            "fields": "spend,impressions,clicks,ctr,cpm,actions",
                            "time_range": {
                                "since": (now - timedelta(days=30)).strftime("%Y-%m-%d"),
                                "until": now.strftime("%Y-%m-%d"),
                            },
                        }

                        for ad_id in ad_account_ids[:1]:
                            try:
                                ad_insights_resp = await client.get(
                                    f"{META_GRAPH_URL}/act_{ad_id.split('_')[-1]}/insights",
                                    params=insights_params,
                                )
                                ad_insights = ad_insights_resp.json()
                                logger.info("Ad insights: %s", ad_insights)

                                for item in ad_insights.get("data", []):
                                    ads_spent = float(item.get("spend", 0))
                                    ads_impressions = int(item.get("impressions", 0))
                                    ads_clicks = int(item.get("clicks", 0))
                                    ads_ctr = float(item.get("ctr", 0))
                                    ads_cpm = float(item.get("cpm", 0))

                                    actions = item.get("actions", [])
                                    conversions = sum(
                                        int(a.get("value", 0))
                                        for a in actions
                                        if "purchase" in a.get("action_type", "").lower()
                                    )
                                    ads_roas = (
                                        round(monthly_revenue / ads_spent, 2)
                                        if ads_spent > 0 and monthly_revenue > 0
                                        else 0.0
                                    )

                                    performance_data = _generate_performance_data(
                                        ad_id, token, now
                                    )
                            except Exception as e:
                                logger.warning("Erro ao buscar ad insights: %s", e)
                except Exception as e:
                    logger.warning("Erro ao buscar insights do Instagram: %s", e)

    videos_month = 0
    credits_total = 50
    credits_used = 0
    last_video_title = None
    last_video_created_at = None

    if account_id:
        try:
            videos_result = await db.execute(
                select(func.count(VideoGeneration.id)).where(
                    VideoGeneration.account_id == account_id,
                    VideoGeneration.created_at >= thirty_days_ago,
                )
            )
            videos_month = videos_result.scalar() or 0

            credits_result = await db.execute(
                select(CreditUsage).where(CreditUsage.account_id == account_id)
            )
            credit_row = credits_result.scalar_one_or_none()
            if credit_row:
                credits_total = credit_row.total_credits
                credits_used = credit_row.used_credits

            last_video_result = await db.execute(
                select(VideoGeneration)
                .where(VideoGeneration.account_id == account_id)
                .order_by(desc(VideoGeneration.created_at))
                .limit(1)
            )
            last_video = last_video_result.scalar_one_or_none()
            if last_video:
                last_video_title = last_video.title
                last_video_created_at = last_video.created_at
        except Exception as e:
            logger.warning("Erro ao buscar dados de vídeo: %s", e)

    recent_activity = []
    if account_id:
        try:
            activities = []

            leads_result = await db.execute(
                select(Lead)
                .where(Lead.account_id == account_id)
                .order_by(desc(Lead.captured_at))
                .limit(5)
            )
            for lead in leads_result.scalars().all():
                activities.append(RecentActivity(
                    id=lead.id,
                    type="lead",
                    description=f"Novo lead: {lead.instagram_handle or lead.name}",
                    created_at=lead.captured_at,
                ))

            videos_result = await db.execute(
                select(VideoGeneration)
                .where(VideoGeneration.account_id == account_id)
                .order_by(desc(VideoGeneration.created_at))
                .limit(5)
            )
            for vid in videos_result.scalars().all():
                activities.append(RecentActivity(
                    id=vid.id,
                    type="video",
                    description=f"Vídeo gerado: {vid.title or 'Sem título'}",
                    created_at=vid.created_at,
                ))

            activities.sort(key=lambda a: a.created_at, reverse=True)
            recent_activity = activities[:10]
        except Exception as e:
            logger.warning("Erro ao buscar atividade recente: %s", e)

    alerts = []
    if account_id:
        try:
            alerts_result = await db.execute(
                select(Alert)
                .where(Alert.account_id == account_id, Alert.is_read == False)
                .order_by(desc(Alert.created_at))
                .limit(5)
            )
            alerts = [
                AlertResponse(
                    id=a.id, type=a.type, severity=a.severity,
                    title=a.title, description=a.description,
                    created_at=a.created_at,
                )
                for a in alerts_result.scalars().all()
            ]
        except Exception as e:
            logger.warning("Erro ao buscar alertas: %s", e)

    return DashboardResponse(
        total_leads=total_leads,
        total_customers=total_customers,
        new_customers_30d=new_customers_30d,
        conversion_rate=round(conversion_rate, 2),
        total_revenue=round(total_revenue, 2),
        monthly_revenue=round(monthly_revenue, 2),
        average_ticket=round(average_ticket, 2),
        projected_revenue=round(projected_revenue, 2),
        ads_spent=round(ads_spent, 2),
        ads_impressions=ads_impressions,
        ads_clicks=ads_clicks,
        ads_ctr=round(ads_ctr, 2),
        ads_cpm=round(ads_cpm, 2),
        ads_roas=round(ads_roas, 2),
        instagram_posts=instagram_posts,
        instagram_reach=instagram_reach,
        instagram_engagement=round(instagram_engagement, 1),
        instagram_followers_delta=instagram_followers_delta,
        videos_generated_month=videos_month,
        credits_total=credits_total,
        credits_used=credits_used,
        last_video_title=last_video_title,
        last_video_created_at=last_video_created_at,
        performance=performance_data[:30],
        recent_activity=recent_activity[:10],
        alerts=alerts[:5],
    )


def _generate_performance_data(
    ad_account_id: str, token: str, now: datetime
) -> list:
    data = []
    for days in [7, 30, 90]:
        since = now - timedelta(days=days)
        since_str = since.strftime("%Y-%m-%d")
        until_str = now.strftime("%Y-%m-%d")

        try:
            import httpx
            with httpx.Client() as client:
                resp = client.get(
                    f"{META_GRAPH_URL}/act_{ad_account_id.split('_')[-1]}/insights",
                    params={
                        "access_token": token,
                        "level": "account",
                        "fields": "spend,impressions,clicks,actions",
                        "time_range": json.dumps({
                            "since": since_str,
                            "until": until_str,
                        }),
                        "time_increment": "1",
                    },
                )
                insights = resp.json()
                for item in insights.get("data", []):
                    date = item.get("date_start", since_str)
                    impressions = int(item.get("impressions", 0))
                    clicks = int(item.get("clicks", 0))
                    actions = item.get("actions", [])
                    conversions = sum(
                        int(a.get("value", 0))
                        for a in actions
                        if "purchase" in a.get("action_type", "").lower()
                    )
                    data.append(PerformancePoint(
                        date=date,
                        impressions=impressions,
                        clicks=clicks,
                        conversions=conversions,
                    ))
        except Exception as e:
            logger.warning("Erro ao gerar performance data: %s", e)

    return data
