import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, and_

from app.core.database import async_session
from app.core.config import settings
from app.models.schedule import PostSchedule
from app.models.meta_connection import MetaConnection, PROVIDER_INSTAGRAM, STATUS_ACTIVE
from app.services.instagram_service import publish_image_post, publish_video_post, TokenExpiredError
from app.services.meta_token_service import decrypt_token

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 60


async def _publish_scheduled_post(schedule: PostSchedule) -> None:
    async with async_session() as db:
        try:
            result = await db.execute(
                select(MetaConnection).where(
                    MetaConnection.account_id == schedule.account_id,
                    MetaConnection.provider == PROVIDER_INSTAGRAM,
                    MetaConnection.status == STATUS_ACTIVE,
                )
            )
            conn = result.scalar_one_or_none()
            if not conn:
                schedule.status = "failed"
                schedule.error_message = "Instagram não conectado"
                await db.flush()
                return

            token = decrypt_token(conn.access_token_encrypted)
            ig_id = conn.ig_business_account_id or conn.meta_user_id
            if not ig_id:
                schedule.status = "failed"
                schedule.error_message = "IG Business ID não encontrado"
                await db.flush()
                return

            caption = schedule.caption or ""
            if schedule.hashtags:
                caption += f"\n\n{schedule.hashtags}"

            if schedule.media_type == "VIDEO":
                result = await publish_video_post(token, ig_id, schedule.media_url, caption)
            else:
                result = await publish_image_post(token, ig_id, schedule.media_url, caption)

            schedule.status = "published"
            schedule.published_at = datetime.now(timezone.utc)
            schedule.media_id_response = result.get("id")
            schedule.error_message = None
            logger.info("Scheduled post %s published for account %s", schedule.id, schedule.account_id)

            # Ativa a automação de comentário deste post (se definida no agendamento)
            if schedule.automation_keyword and schedule.media_id_response:
                from app.services.post_automation import create_post_automation
                await create_post_automation(
                    db, schedule.account_id, schedule.media_id_response,
                    schedule.automation_keyword, schedule.automation_comment_reply,
                    schedule.automation_dm_message, schedule.automation_link_message,
                )

            # Já publicado: apaga a mídia do storage (o registro fica como "check").
            from app.services import storage_service
            await storage_service.delete_by_url(schedule.media_url)

        except TokenExpiredError as e:
            schedule.status = "failed"
            schedule.error_message = f"Token expirado: {e}"
        except Exception as e:
            schedule.retry_count = (schedule.retry_count or 0) + 1
            if schedule.retry_count >= 3:
                schedule.status = "failed"
            schedule.error_message = str(e)
            logger.warning("Failed to publish scheduled post %s (retry %d): %s", schedule.id, schedule.retry_count, e)

        await db.commit()


async def scheduler_loop():
    logger.info("Scheduler started (polling every %ds)", _POLL_INTERVAL)
    while True:
        try:
            now = datetime.now(timezone.utc)
            async with async_session() as db:
                result = await db.execute(
                    select(PostSchedule).where(
                        and_(
                            PostSchedule.status == "scheduled",
                            PostSchedule.scheduled_for <= now,
                        )
                    )
                )
                due_posts = result.scalars().all()

            for post in due_posts:
                await _publish_scheduled_post(post)

        except Exception as e:
            logger.error("Scheduler error: %s", e)

        await asyncio.sleep(_POLL_INTERVAL)
