import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account
from app.models.meta_connection import MetaConnection, STATUS_NEEDS_REAUTH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


# ---------------------------------------------------------------------------
# Webhook challenge verification (GET)
# ---------------------------------------------------------------------------

@router.get("/meta")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.meta_webhook_verify_token:
            logger.info("Webhook verified.")
            return int(challenge)
        raise HTTPException(status_code=403, detail="Token de verificação inválido.")

    raise HTTPException(status_code=400, detail="Requisição de verificação inválida.")


# ---------------------------------------------------------------------------
# Event receiver (POST) — validates X-Hub-Signature-256 before processing
# ---------------------------------------------------------------------------

@router.post("/meta")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()

    # Signature validation — reject unsigned/tampered payloads
    sig_header = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_signature(body, sig_header):
        logger.warning("Webhook signature mismatch — rejecting payload.")
        raise HTTPException(status_code=403, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    logger.info("Webhook received: %s", payload)

    for item in payload.get("entry", []):
        page_id = item.get("id")
        if not page_id:
            continue

        # Resolve tenant from page_id (legacy Account table first, then MetaConnection)
        account = await _resolve_tenant_by_page_id(page_id, db)
        if not account:
            logger.warning("No tenant found for page_id=%s", page_id)
            continue

        for change in item.get("changes", []):
            field = change.get("field")
            value = change.get("value", {})
            await _route_change(field, value, account, db)

        # WhatsApp messages arrive under "messages" key (not "changes")
        for msg_entry in item.get("messages", []):
            await handle_whatsapp_message(account, msg_entry, db)

    return {"status": "received"}


# ---------------------------------------------------------------------------
# Event routing
# ---------------------------------------------------------------------------

async def _route_change(field: str, value: dict, account: Account, db: AsyncSession):
    if field == "comments":
        await handle_ig_comment(account, value, db)
    elif field == "messaging":
        await handle_ig_dm(account, value, db)
    elif field == "messages":
        await handle_whatsapp_message(account, value, db)
    else:
        logger.debug("Unhandled webhook field '%s' for account %s", field, account.id)


async def handle_ig_comment(account: Account, value: dict, db: AsyncSession):
    logger.info("IG comment for account %s: %s", account.id, value)
    await dispatch_event("ig_comment", account.id, value)


async def handle_ig_dm(account: Account, value: dict, db: AsyncSession):
    logger.info("IG DM for account %s: %s", account.id, value)
    await dispatch_event("ig_dm", account.id, value)


async def handle_whatsapp_message(account: Account, value: dict, db: AsyncSession):
    logger.info("WhatsApp message for account %s: %s", account.id, value)
    await dispatch_event("whatsapp_message", account.id, value)


# ---------------------------------------------------------------------------
# Pluggable event dispatcher
# ---------------------------------------------------------------------------

async def dispatch_event(event_type: str, tenant_id: str, payload: dict) -> None:
    """
    Forward a normalized event to n8n (if N8N_WEBHOOK_URL is set) or log only.
    Swap out this function to route to a queue, SSE stream, etc.
    """
    event = {"event_type": event_type, "tenant_id": tenant_id, "payload": payload}

    if settings.n8n_webhook_url:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(settings.n8n_webhook_url, json=event, timeout=5.0)
        except Exception as exc:
            logger.warning("dispatch_event: failed to reach n8n (%s)", exc)
    else:
        logger.info("dispatch_event (no n8n URL configured): %s", event)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _verify_signature(body: bytes, signature_header: str) -> bool:
    """Validate X-Hub-Signature-256: sha256=<hex>."""
    if not signature_header.startswith("sha256="):
        return False
    expected = signature_header[7:]
    actual = hmac.new(
        settings.meta_app_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(actual, expected)


async def _resolve_tenant_by_page_id(page_id: str, db: AsyncSession) -> Account | None:
    """Find the Account that owns page_id, checking both tables."""
    # 1. Check legacy Account table
    result = await db.execute(select(Account).where(Account.meta_page_id == page_id))
    account = result.scalar_one_or_none()
    if account:
        return account

    # 2. Check MetaConnection table (new multi-provider connections)
    conn_result = await db.execute(
        select(MetaConnection).where(MetaConnection.page_id == page_id)
    )
    connection = conn_result.scalar_one_or_none()
    if connection:
        acc_result = await db.execute(select(Account).where(Account.id == connection.account_id))
        return acc_result.scalar_one_or_none()

    return None
