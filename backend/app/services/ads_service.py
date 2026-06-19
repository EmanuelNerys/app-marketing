"""
Meta Ads (Marketing API) service — minimum viable implementation.

act_ prefix handling: Meta ad account IDs come back either as "act_123" or plain
"123" depending on the endpoint.  _act() normalises them.
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 500, 502, 503}
_MAX_RETRIES = 3


def _act(ad_account_id: str) -> str:
    """Ensure the ID has the act_ prefix expected by the Marketing API."""
    return ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"


async def _request(method: str, url: str, **kwargs) -> dict:
    for attempt in range(_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(method, url, **kwargs)

        if resp.status_code not in _RETRY_STATUSES:
            return resp.json()

        wait = 2 ** attempt
        logger.warning("HTTP %s from %s — retrying in %ss", resp.status_code, url, wait)
        await asyncio.sleep(wait)

    return resp.json()


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

async def list_campaigns(token: str, ad_account_id: str) -> list[dict]:
    """List campaigns for an ad account."""
    data = await _request(
        "GET",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/campaigns",
        params={
            "access_token": token,
            "fields": "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
            "limit": "50",
        },
    )
    return data.get("data", [])


async def create_campaign(
    token: str,
    ad_account_id: str,
    name: str,
    objective: str,
    status: str = "PAUSED",
    special_ad_categories: list[str] | None = None,
) -> dict:
    """
    Create a campaign.

    objective examples: OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_AWARENESS
    status: ACTIVE | PAUSED
    """
    payload = {
        "name": name,
        "objective": objective,
        "status": status,
        "special_ad_categories": special_ad_categories or [],
    }
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/campaigns",
        params={"access_token": token},
        json=payload,
    )


# ---------------------------------------------------------------------------
# Ad Sets
# ---------------------------------------------------------------------------

async def create_ad_set(
    token: str,
    ad_account_id: str,
    campaign_id: str,
    name: str,
    daily_budget: int,
    billing_event: str = "IMPRESSIONS",
    optimization_goal: str = "REACH",
    targeting: dict | None = None,
) -> dict:
    """
    Create an ad set inside a campaign.

    daily_budget is in account currency minor units (e.g. centavos for BRL).

    TODO: add bid_amount, end_time, attribution_spec, promoted_object support.
    """
    payload = {
        "name": name,
        "campaign_id": campaign_id,
        "daily_budget": str(daily_budget),
        "billing_event": billing_event,
        "optimization_goal": optimization_goal,
        "targeting": targeting or {"geo_locations": {"countries": ["BR"]}},
        "status": "PAUSED",
    }
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/adsets",
        params={"access_token": token},
        json=payload,
    )


# ---------------------------------------------------------------------------
# Ad Creatives & Ads
# ---------------------------------------------------------------------------

async def create_ad_creative(
    token: str,
    ad_account_id: str,
    name: str,
    page_id: str,
    message: str,
    image_url: str | None = None,
    link_url: str | None = None,
) -> dict:
    """Create an ad creative (image + copy).  TODO: video, carousel support."""
    object_story_spec: dict = {
        "page_id": page_id,
        "link_data": {
            "message": message,
            **({"link": link_url} if link_url else {}),
            **({"picture": image_url} if image_url else {}),
        },
    }
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/adcreatives",
        params={"access_token": token},
        json={"name": name, "object_story_spec": object_story_spec},
    )


async def create_ad(
    token: str,
    ad_account_id: str,
    ad_set_id: str,
    creative_id: str,
    name: str,
    status: str = "PAUSED",
) -> dict:
    """Create an ad linking an ad set to a creative."""
    return await _request(
        "POST",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/ads",
        params={"access_token": token},
        json={
            "name": name,
            "adset_id": ad_set_id,
            "creative": {"creative_id": creative_id},
            "status": status,
        },
    )


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

async def get_account_insights(
    token: str,
    ad_account_id: str,
    date_preset: str = "last_30d",
    fields: str = "spend,impressions,clicks,ctr,cpm,actions",
) -> list[dict]:
    """Fetch account-level insights."""
    data = await _request(
        "GET",
        f"{settings.meta_graph_url}/{_act(ad_account_id)}/insights",
        params={
            "access_token": token,
            "level": "account",
            "fields": fields,
            "date_preset": date_preset,
        },
    )
    return data.get("data", [])
