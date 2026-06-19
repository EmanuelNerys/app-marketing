"""
WhatsApp Business API (Cloud API) service.

Requires a WhatsApp Business Account (WABA) and a Phone Number ID, both
available after the WhatsApp OAuth connection is established.
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 500, 502, 503}
_MAX_RETRIES = 3


async def _request(method: str, url: str, **kwargs) -> dict:
    for attempt in range(_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method, url, **kwargs)

        if resp.status_code not in _RETRY_STATUSES:
            return resp.json()

        wait = 2 ** attempt
        logger.warning("HTTP %s from %s — retrying in %ss", resp.status_code, url, wait)
        await asyncio.sleep(wait)

    return resp.json()


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

async def send_text(
    token: str,
    phone_number_id: str,
    to: str,
    body: str,
) -> dict:
    """Send a free-form text message (only valid within the 24-h customer window)."""
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{phone_number_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": body},
        },
    )


async def send_template(
    token: str,
    phone_number_id: str,
    to: str,
    template_name: str,
    language_code: str = "pt_BR",
    components: list | None = None,
) -> dict:
    """Send an approved message template (works outside the 24-h window)."""
    payload: dict = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
    if components:
        payload["template"]["components"] = components

    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{phone_number_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )


async def mark_as_read(token: str, phone_number_id: str, message_id: str) -> dict:
    """Mark an incoming message as read (removes the double-tick indicator)."""
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{phone_number_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        },
    )
