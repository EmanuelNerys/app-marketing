"""
WhatsApp Business Cloud API service.

Requer:
  - Phone Number ID (por tenant)
  - WABA ID (por tenant)
  - System User Token ou token de longa duração
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 500, 502, 503}
_MAX_RETRIES = 3


async def _request(method: str, url: str, **kwargs) -> dict:
    last_resp = None
    for attempt in range(_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=15.0) as client:
            last_resp = await client.request(method, url, **kwargs)

        if last_resp.status_code not in _RETRY_STATUSES:
            data = last_resp.json()
            if last_resp.status_code >= 400:
                logger.warning("Meta API error %s: %s", last_resp.status_code, data)
            return data

        wait = 2 ** attempt
        logger.warning("HTTP %s from %s — retry in %ss", last_resp.status_code, url, wait)
        await asyncio.sleep(wait)

    return last_resp.json() if last_resp else {}


# ---------------------------------------------------------------------------
# Mensagens
# ---------------------------------------------------------------------------

async def send_text(token: str, phone_number_id: str, to: str, body: str) -> dict:
    """Texto livre — válido apenas dentro da janela de 24h."""
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
    """Template aprovado — funciona fora da janela de 24h."""
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


async def send_media(
    token: str,
    phone_number_id: str,
    to: str,
    media_type: str,
    media_url: str,
    caption: str | None = None,
) -> dict:
    """Envia mídia (image/video/document/audio) por URL pública."""
    media_payload: dict = {"link": media_url}
    if caption and media_type in ("image", "video", "document"):
        media_payload["caption"] = caption

    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{phone_number_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": media_type,
            media_type: media_payload,
        },
    )


async def mark_as_read(token: str, phone_number_id: str, message_id: str) -> dict:
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


# ---------------------------------------------------------------------------
# Download de mídia
# ---------------------------------------------------------------------------

async def download_media(token: str, media_id: str, return_url_only: bool = False) -> bytes | str:
    """
    Passo 1: obtém a URL do arquivo.
    Passo 2: baixa o arquivo (se return_url_only=False).
    Retorna os bytes brutos ou a URL pública.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        r1 = await client.get(
            f"{settings.meta_graph_url}/{media_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        r1.raise_for_status()
        media_url = r1.json().get("url")
        if not media_url:
            raise ValueError(f"Meta não retornou URL para media_id={media_id}")

        if return_url_only:
            return media_url

        r2 = await client.get(media_url, headers={"Authorization": f"Bearer {token}"})
        r2.raise_for_status()
        return r2.content


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

async def list_templates(token: str, waba_id: str, limit: int = 100) -> list[dict]:
    """Retorna todos os templates do WABA (atravessa paginação)."""
    templates: list[dict] = []
    url = f"{settings.meta_graph_url}/{waba_id}/message_templates"
    params = {"limit": limit, "fields": "id,name,language,status,category,components"}

    while url:
        data = await _request("GET", url, headers={"Authorization": f"Bearer {token}"},
                              params=params)
        templates.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = {}  # next URL already has params embedded

    return templates


async def create_template(
    token: str,
    waba_id: str,
    name: str,
    category: str,
    language: str,
    components: list[dict],
) -> dict:
    """Envia template para aprovação da Meta."""
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{waba_id}/message_templates",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": name,
            "category": category,
            "language": language,
            "components": components,
        },
    )


async def delete_template(token: str, waba_id: str, name: str) -> dict:
    return await _request(
        "DELETE",
        f"{settings.meta_graph_url}/{waba_id}/message_templates",
        headers={"Authorization": f"Bearer {token}"},
        params={"name": name},
    )
