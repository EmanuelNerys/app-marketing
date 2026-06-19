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
from app.models.lead import Lead, LeadSource, LeadStatus
from app.models.automation import AutomationConfig
from app.models.meta_connection import MetaConnection, PROVIDER_INSTAGRAM, STATUS_ACTIVE
from app.services import instagram_service
from app.services.meta_token_service import safe_decrypt_token, decrypt_token

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
# Event receiver (POST)
# ---------------------------------------------------------------------------

@router.post("/meta")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()

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

        account = await _resolve_tenant_by_page_id(page_id, db)
        if not account:
            logger.warning("No tenant found for page_id=%s", page_id)
            continue

        for change in item.get("changes", []):
            field = change.get("field")
            value = change.get("value", {})
            await _route_change(field, value, account, db)

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
        # WhatsApp Cloud API: entry[].changes[].field == "messages"
        await handle_whatsapp_message(account, value, db)
    else:
        logger.debug("Unhandled webhook field '%s' for account %s", field, account.id)


# ---------------------------------------------------------------------------
# Instagram comment handler — salva lead + auto-reply por keyword
# ---------------------------------------------------------------------------

async def handle_ig_comment(account: Account, value: dict, db: AsyncSession):
    """
    Payload example:
    {
      "from": {"id": "123", "username": "joao_silva"},
      "media": {"id": "MEDIA_ID"},
      "id": "COMMENT_ID",
      "text": "Quero saber mais!"
    }
    """
    from_data = value.get("from", {})
    instagram_handle = from_data.get("username") or from_data.get("id", "unknown")
    comment_id = value.get("id", "")
    comment_text = value.get("text", "")

    # Salva o lead (cada comentário pode gerar um novo lead ou reusar existente)
    existing = await _find_lead(account.id, instagram_handle, db)
    if not existing:
        lead = Lead(
            account_id=account.id,
            instagram_handle=instagram_handle,
            source=LeadSource.INSTAGRAM_COMMENT,
            status=LeadStatus.NEW,
            metadata_json=json.dumps({"comment_id": comment_id, "text": comment_text}),
        )
        db.add(lead)
        logger.info("Novo lead (comentário): %s | conta %s", instagram_handle, account.id)

    # Verifica automações ativas para esse tenant
    if comment_text:
        matched = await _match_automation(account.id, comment_text, db)
        if matched:
            token = await _get_token(account, db)
            if token and comment_id:
                try:
                    await instagram_service.reply_to_comment(token, comment_id, matched.auto_reply_message)
                    logger.info("Auto-reply enviado no comentário %s", comment_id)
                except Exception as exc:
                    logger.warning("Falha no auto-reply de comentário: %s", exc)

    await dispatch_event("ig_comment", account.id, value)


# ---------------------------------------------------------------------------
# Instagram DM handler — salva lead + auto-reply por keyword
# ---------------------------------------------------------------------------

async def handle_ig_dm(account: Account, value: dict, db: AsyncSession):
    """
    Payload example:
    {
      "sender": {"id": "PSID_DO_USUARIO"},
      "recipient": {"id": "PAGE_ID"},
      "timestamp": 1234567890,
      "message": {"mid": "MSG_ID", "text": "oi quero informações"}
    }
    """
    sender_id = value.get("sender", {}).get("id", "")
    message = value.get("message", {})
    message_text = message.get("text", "")
    message_id = message.get("mid", "")

    # Ignora eco de mensagens enviadas pelo próprio app
    if value.get("sender", {}).get("id") == value.get("recipient", {}).get("id"):
        return

    if not sender_id:
        return

    # Salva o lead (upsert — mesma pessoa pode mandar vários DMs)
    existing = await _find_lead(account.id, sender_id, db)
    if not existing:
        lead = Lead(
            account_id=account.id,
            instagram_handle=sender_id,  # PSID; handle real pode ser buscado depois
            source=LeadSource.INSTAGRAM_DM,
            status=LeadStatus.NEW,
            metadata_json=json.dumps({"first_message": message_text}),
        )
        db.add(lead)
        logger.info("Novo lead (DM): %s | conta %s", sender_id, account.id)

    # Verifica automações e responde
    if message_text:
        matched = await _match_automation(account.id, message_text, db)
        if matched:
            token = await _get_token(account, db)
            if token:
                try:
                    await instagram_service.send_dm(token, sender_id, matched.auto_reply_message)
                    logger.info("Auto-reply DM enviado para %s", sender_id)
                except Exception as exc:
                    logger.warning("Falha no auto-reply de DM: %s", exc)

    await dispatch_event("ig_dm", account.id, value)


# ---------------------------------------------------------------------------
# WhatsApp handler (placeholder — fluxo real requer Embedded Signup)
# ---------------------------------------------------------------------------

async def handle_whatsapp_message(account: Account, value: dict, db: AsyncSession):
    logger.info("WhatsApp message for account %s: %s", account.id, value)
    await dispatch_event("whatsapp_message", account.id, value)


# ---------------------------------------------------------------------------
# Pluggable event dispatcher
# ---------------------------------------------------------------------------

async def dispatch_event(event_type: str, tenant_id: str, payload: dict) -> None:
    event = {"event_type": event_type, "tenant_id": tenant_id, "payload": payload}
    if settings.n8n_webhook_url:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(settings.n8n_webhook_url, json=event, timeout=5.0)
        except Exception as exc:
            logger.warning("dispatch_event: failed to reach n8n (%s)", exc)
    else:
        logger.info("dispatch_event (no n8n URL): %s", event)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _verify_signature(body: bytes, signature_header: str) -> bool:
    if not signature_header.startswith("sha256="):
        return False
    expected = signature_header[7:]
    actual = hmac.new(
        settings.meta_app_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(actual, expected)


async def _resolve_tenant_by_page_id(page_id: str, db: AsyncSession) -> Account | None:
    result = await db.execute(select(Account).where(Account.meta_page_id == page_id))
    account = result.scalar_one_or_none()
    if account:
        return account

    conn_result = await db.execute(
        select(MetaConnection).where(MetaConnection.page_id == page_id)
    )
    connection = conn_result.scalar_one_or_none()
    if connection:
        acc_result = await db.execute(select(Account).where(Account.id == connection.account_id))
        return acc_result.scalar_one_or_none()

    return None


async def _find_lead(account_id: str, instagram_handle: str, db: AsyncSession) -> Lead | None:
    result = await db.execute(
        select(Lead).where(
            Lead.account_id == account_id,
            Lead.instagram_handle == instagram_handle,
        )
    )
    return result.scalar_one_or_none()


async def _match_automation(account_id: str, text: str, db: AsyncSession) -> AutomationConfig | None:
    """Retorna a primeira AutomationConfig ativa cuja keyword aparece no texto."""
    result = await db.execute(
        select(AutomationConfig).where(
            AutomationConfig.account_id == account_id,
            AutomationConfig.is_active == True,
        )
    )
    for config in result.scalars().all():
        if config.keyword.lower() in text.lower():
            return config
    return None


async def _get_token(account: Account, db: AsyncSession) -> str | None:
    """Obtém o token de acesso para chamadas à API do Instagram."""
    # 1. Token legado (onboarding antigo)
    if account.meta_access_token:
        return safe_decrypt_token(account.meta_access_token)

    # 2. MetaConnection (fluxo multi-provider novo)
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == account.id,
            MetaConnection.provider == PROVIDER_INSTAGRAM,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if conn:
        try:
            return decrypt_token(conn.access_token_encrypted)
        except Exception:
            return None

    return None
