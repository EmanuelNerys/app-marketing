"""
Instagram Graph API service.

All functions receive a decrypted access token (use meta_token_service.decrypt_token
to obtain it from MetaConnection.access_token_encrypted).
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 500, 502, 503}
_MAX_RETRIES = 3


async def _request(method: str, url: str, **kwargs) -> dict:
    """HTTP request with exponential back-off on rate-limit / server errors."""
    for attempt in range(_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method, url, **kwargs)

        if resp.status_code not in _RETRY_STATUSES:
            data = resp.json()
            _check_token_error(data)
            return data

        wait = 2 ** attempt
        logger.warning("HTTP %s from %s — retrying in %ss (attempt %d)", resp.status_code, url, wait, attempt + 1)
        await asyncio.sleep(wait)

    return resp.json()


def _check_token_error(data: dict) -> None:
    """Raise a descriptive error when Meta returns a token-related error."""
    error = data.get("error", {})
    code = error.get("code")
    if code in (190, 102, 2500):
        raise TokenExpiredError(f"Meta token error (code {code}): {error.get('message')}")


class TokenExpiredError(Exception):
    """Raised when Meta returns a token-expired / invalid-token error."""


# ---------------------------------------------------------------------------
# Direct Messages (IG Messaging API)
# ---------------------------------------------------------------------------

async def send_dm(token: str, recipient_id: str, message: str) -> dict:
    """Send a direct message to an Instagram user."""
    return await _request(
        "POST",
        f"{settings.ig_graph_url}/me/messages",
        params={"access_token": token},
        json={"recipient": {"id": recipient_id}, "message": {"text": message}},
    )


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

async def reply_to_comment(token: str, comment_id: str, message: str) -> dict:
    """Reply to an Instagram comment (public, visible under the post)."""
    return await _request(
        "POST",
        f"{settings.ig_graph_url}/{comment_id}/replies",
        params={"access_token": token},
        json={"message": message},
    )


async def send_private_reply(token: str, comment_id: str, message: str) -> dict:
    """
    Send a private DM in response to a specific comment ("private reply").

    Meta constraints (not configurable): the reply must be sent within 7 days
    of the comment, and only one private reply is allowed per comment_id —
    a second attempt returns an error from the Graph API.
    """
    return await _request(
        "POST",
        f"{settings.ig_graph_url}/me/messages",
        params={"access_token": token},
        json={"recipient": {"comment_id": comment_id}, "message": {"text": message}},
    )


# ---------------------------------------------------------------------------
# Media publishing (container flow)
# ---------------------------------------------------------------------------

async def publish_image_post(
    token: str,
    ig_user_id: str,
    image_url: str,
    caption: str = "",
) -> dict:
    """
    Publish a single image post via the two-step container flow:
    1. Create a media container
    2. Publish the container
    """
    container = await _request(
        "POST",
        f"{settings.ig_graph_url}/{ig_user_id}/media",
        params={"access_token": token},
        json={"image_url": image_url, "caption": caption},
    )
    container_id = container.get("id")
    if not container_id:
        raise ValueError(f"Failed to create media container: {container}")

    return await _request(
        "POST",
        f"{settings.ig_graph_url}/{ig_user_id}/media_publish",
        params={"access_token": token},
        json={"creation_id": container_id},
    )


async def publish_video_post(
    token: str,
    ig_user_id: str,
    video_url: str,
    caption: str = "",
) -> dict:
    """
    Publish a Reel/video post.  Meta requires polling until the container is FINISHED
    before publishing — this does a simple retry loop (max 10 × 5 s).
    """
    container = await _request(
        "POST",
        f"{settings.ig_graph_url}/{ig_user_id}/media",
        params={"access_token": token},
        json={"video_url": video_url, "caption": caption, "media_type": "REELS"},
    )
    container_id = container.get("id")
    if not container_id:
        raise ValueError(f"Failed to create video container: {container}")

    for _ in range(10):
        status = await _request(
            "GET",
            f"{settings.ig_graph_url}/{container_id}",
            params={"access_token": token, "fields": "status_code"},
        )
        if status.get("status_code") == "FINISHED":
            break
        await asyncio.sleep(5)

    return await _request(
        "POST",
        f"{settings.ig_graph_url}/{ig_user_id}/media_publish",
        params={"access_token": token},
        json={"creation_id": container_id},
    )


# ---------------------------------------------------------------------------
# Media listing
# ---------------------------------------------------------------------------

async def list_media(token: str, ig_user_id: str, limit: int = 20) -> list[dict]:
    """List recent media objects for an IG Business account."""
    data = await _request(
        "GET",
        f"{settings.ig_graph_url}/{ig_user_id}/media",
        params={
            "access_token": token,
            "fields": "id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count",
            "limit": str(limit),
        },
    )
    return data.get("data", [])
