import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.core.ws_manager import ws_manager
from app.core.phone import normalize_phone
from app.models.account import Account
from app.models.lead import Lead, LeadSource, LeadStatus
from app.models.automation import AutomationConfig
from app.models.meta_connection import MetaConnection, PROVIDER_INSTAGRAM, PROVIDER_WHATSAPP, STATUS_ACTIVE
from app.models.conversation import Conversation
from app.models.message import Message
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


@router.get("/instagram")
async def verify_instagram_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.meta_webhook_verify_token:
            logger.info("Instagram webhook verified.")
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

    obj = payload.get("object", "")

    for item in payload.get("entry", []):
        entry_id = item.get("id", "")

        for change in item.get("changes", []):
            field = change.get("field")
            value = change.get("value", {})

            if obj == "whatsapp_business_account" or field == "messages":
                # WhatsApp Cloud API: route by phone_number_id inside metadata
                phone_number_id = value.get("metadata", {}).get("phone_number_id") or entry_id
                conn, account = await _get_tenant_by_phone_id_cached(phone_number_id, db)
                if not account:
                    logger.warning("No WPP tenant for phone_number_id=%s", phone_number_id)
                    continue
                await handle_whatsapp_message(conn, account, value, db)
            else:
                # Instagram / other Meta apps: route by page_id (entry.id)
                account = await _resolve_tenant_by_page_id(entry_id, db)
                if not account:
                    logger.warning("No IG tenant for page_id=%s", entry_id)
                    continue
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
    media_id = value.get("media", {}).get("id")

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

    # Verifica automações ativas para esse tenant (escopo: comentário, opcionalmente por post)
    if comment_text:
        matched = await _match_automation(account.id, comment_text, db, channel="comment", media_id=media_id)
        if matched:
            token = await _get_token(account, db)
            if token and comment_id:
                # Resposta pública no comentário (mantém o comportamento legado como fallback)
                reply_text = matched.comment_reply_message or matched.auto_reply_message
                if reply_text:
                    try:
                        await instagram_service.reply_to_comment(token, comment_id, reply_text)
                        logger.info("Auto-reply enviado no comentário %s", comment_id)
                    except Exception as exc:
                        logger.warning("Falha no auto-reply de comentário: %s", exc)

                # DM privada disparada pelo comentário ("comenta X e recebe no direto")
                if matched.dm_message:
                    try:
                        await instagram_service.send_private_reply(token, comment_id, matched.dm_message)
                        logger.info("DM privada enviada para comentário %s", comment_id)
                    except Exception as exc:
                        logger.warning("Falha ao enviar DM privada do comentário %s: %s", comment_id, exc)

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
        matched = await _match_automation(account.id, message_text, db, channel="dm")
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
# WhatsApp Cloud API handler
# ---------------------------------------------------------------------------

async def handle_whatsapp_message(
    conn: MetaConnection,
    account: Account,
    value: dict,
    db: AsyncSession,
):
    """
    Payload structure (Cloud API):
    {
      "messaging_product": "whatsapp",
      "metadata": {"display_phone_number": "...", "phone_number_id": "..."},
      "contacts": [{"profile": {"name": "..."}, "wa_id": "55..."}],
      "messages": [{"from": "55...", "id": "wamid...", "timestamp": "...",
                    "text": {"body": "..."}, "type": "text"}],
      "statuses": [{"id": "wamid...", "status": "delivered", ...}]
    }
    """
    tenant_id = account.id

    # ---- Delivery/read status updates ----
    for status_evt in value.get("statuses", []):
        wamid = status_evt.get("id")
        new_status = status_evt.get("status")  # sent/delivered/read/failed
        pricing = status_evt.get("pricing", {})
        category = pricing.get("category", "").lower()  # marketing/utility/service/authentication

        if wamid and new_status:
            result = await db.execute(select(Message).where(Message.message_id == wamid))
            msg = result.scalar_one_or_none()
            if msg:
                msg.status = new_status
                if category and pricing.get("billable"):
                    msg.meta_category = category
                await ws_manager.broadcast(tenant_id, "message_status_updated",
                                           {"message_id": wamid, "status": new_status,
                                            "conversation_id": msg.conversation_id})
        # Increment monthly counters
        if category and pricing.get("billable"):
            if category == "marketing":
                conn.conv_count_marketing = (conn.conv_count_marketing or 0) + 1
            elif category == "utility":
                conn.conv_count_utility = (conn.conv_count_utility or 0) + 1
            elif category == "service":
                conn.conv_count_service = (conn.conv_count_service or 0) + 1
            elif category == "authentication":
                conn.conv_count_auth = (conn.conv_count_auth or 0) + 1

    # ---- Incoming messages ----
    contacts = {c["wa_id"]: c.get("profile", {}).get("name") for c in value.get("contacts", [])}

    for msg_data in value.get("messages", []):
        wa_from = msg_data.get("from", "")
        wamid = msg_data.get("id", "")
        msg_type = msg_data.get("type", "text")
        timestamp = int(msg_data.get("timestamp", 0))

        # Extract text/caption depending on type
        text_body: str | None = None
        media_type: str | None = None
        media_id: str | None = None
        media_url: str | None = None

        if msg_type == "text":
            text_body = msg_data.get("text", {}).get("body")
        elif msg_type in ("image", "video", "audio", "document", "sticker"):
            media_type = msg_type
            text_body = msg_data.get(msg_type, {}).get("caption")
            media_id = msg_data.get(msg_type, {}).get("id")
        elif msg_type == "interactive":
            # Button reply or list reply
            interactive = msg_data.get("interactive", {})
            if interactive.get("type") == "button_reply":
                text_body = interactive["button_reply"].get("title")
            elif interactive.get("type") == "list_reply":
                text_body = interactive["list_reply"].get("title")

        # Download media from Meta if present
        if media_id:
            try:
                token = decrypt_token(conn.access_token_encrypted)
                from app.services import whatsapp_service
                media_url = await whatsapp_service.download_media(token, media_id, return_url_only=True)
            except Exception as exc:
                logger.warning("Failed to download media %s: %s", media_id, exc)

        # Upsert lead — cria automaticamente com nome + número quando vem do WhatsApp
        normalized_phone = normalize_phone(wa_from) or wa_from
        lead = await _find_lead(tenant_id, wa_from, db)
        if not lead:
            customer_name = contacts.get(wa_from)
            lead = Lead(
                id=str(uuid.uuid4()),
                account_id=tenant_id,
                instagram_handle=wa_from,
                phone=normalized_phone,
                name=customer_name or normalized_phone,
                source=LeadSource.INSTAGRAM_DM,
                status=LeadStatus.NEW,
            )
            db.add(lead)
            await db.flush()
        elif not lead.phone:
            # Lead já existia (ex: veio do Instagram) — agora temos o número
            lead.phone = normalized_phone

        # Find or create conversation for this wa_id
        conv = await _get_or_create_wpp_conversation(tenant_id, lead.id, db)

        # Save message
        msg = Message(
            tenant_id=tenant_id,
            conversation_id=conv.id,
            sender=wa_from,
            text=text_body,
            direction="inbound",
            wa_id=wa_from,
            status="delivered",
            message_id=wamid,
            media_type=media_type,
            media_url=media_url,
            payload=msg_data,
            is_within_24h_window=True,
            created_at=datetime.fromtimestamp(timestamp, tz=timezone.utc) if timestamp else datetime.now(timezone.utc),
        )
        db.add(msg)

        # Update conversation unread count + last_updated
        conv.unread_count = (conv.unread_count or 0) + 1
        conv.last_updated = datetime.now(timezone.utc)
        conv.atendimento_status = "aberto"
        await db.flush()
        await db.refresh(msg)

        # Mark as read at Meta (best-effort)
        try:
            token = decrypt_token(conn.access_token_encrypted)
            from app.services import whatsapp_service
            await whatsapp_service.mark_as_read(token, conn.phone_number_id, wamid)
        except Exception as exc:
            logger.debug("mark_as_read failed: %s", exc)

        # Broadcast to connected frontend clients
        await ws_manager.broadcast(tenant_id, "new_message", {
            "id": msg.id,
            "conversation_id": conv.id,
            "wa_id": wa_from,
            "sender": wa_from,
            "text": text_body,
            "media_type": media_type,
            "media_url": media_url,
            "direction": "inbound",
            "status": "delivered",
            "message_id": wamid,
            "created_at": msg.created_at.isoformat(),
        })
        await ws_manager.broadcast(tenant_id, "conversation_updated", {
            "id": conv.id,
            "unread_count": conv.unread_count,
            "atendimento_status": conv.atendimento_status,
            "last_updated": conv.last_updated.isoformat(),
        })

        # Auto-reply por keyword para WhatsApp (se configurado)
        if text_body:
            matched = await _match_automation(tenant_id, text_body, db)
            if matched:
                try:
                    token = decrypt_token(conn.access_token_encrypted)
                    from app.services import whatsapp_service
                    await whatsapp_service.send_text(token, conn.phone_number_id, wa_from, matched.auto_reply_message)
                    # Salva resposta do bot
                    bot_msg = Message(
                        tenant_id=tenant_id,
                        conversation_id=conv.id,
                        sender="bot",
                        text=matched.auto_reply_message,
                        direction="outbound",
                        wa_id=wa_from,
                        status="sent",
                        is_within_24h_window=True,
                    )
                    db.add(bot_msg)
                    await db.flush()
                    await ws_manager.broadcast(tenant_id, "new_message", {
                        "id": bot_msg.id,
                        "conversation_id": conv.id,
                        "sender": "bot",
                        "text": matched.auto_reply_message,
                        "direction": "outbound",
                        "wa_id": wa_from,
                        "status": "sent",
                        "created_at": bot_msg.created_at.isoformat(),
                    })
                except Exception as exc:
                    logger.warning("Falha no auto-reply WhatsApp: %s", exc)

        await dispatch_event("whatsapp_message", tenant_id, msg_data)


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


async def _resolve_wpp_tenant(
    phone_number_id: str, db: AsyncSession
) -> tuple[MetaConnection | None, Account | None]:
    """Find tenant by WhatsApp phone_number_id stored in meta_connections."""
    result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.phone_number_id == phone_number_id,
            MetaConnection.provider == PROVIDER_WHATSAPP,
            MetaConnection.status == STATUS_ACTIVE,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        return None, None
    acc_result = await db.execute(select(Account).where(Account.id == conn.account_id))
    return conn, acc_result.scalar_one_or_none()


async def _get_or_create_wpp_conversation(
    tenant_id: str, customer_id: str, db: AsyncSession
) -> Conversation:
    """Return existing open conversation for this customer or create a new one."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == customer_id,
            Conversation.status == "active",
        ).order_by(Conversation.last_updated.desc()).limit(1)
    )
    conv = result.scalar_one_or_none()
    if conv:
        return conv
    conv = Conversation(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        atendimento_status="aberto",
        status="active",
        unread_count=0,
    )
    db.add(conv)
    await db.flush()
    return conv


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


async def _match_automation(
    account_id: str,
    text: str,
    db: AsyncSession,
    channel: str = "dm",
    media_id: str | None = None,
) -> AutomationConfig | None:
    """
    Retorna a primeira AutomationConfig ativa cuja keyword aparece no texto.

    channel: "comment" (comentário IG), "dm" (DM IG ou mensagem WhatsApp).
    Uma automação com trigger_type="both" reage nos dois canais; media_id
    restringe o disparo a comentários de um post específico quando definido.
    """
    result = await db.execute(
        select(AutomationConfig).where(
            AutomationConfig.account_id == account_id,
            AutomationConfig.is_active == True,
        )
    )
    for config in result.scalars().all():
        if config.trigger_type not in ("both", channel):
            continue
        if config.media_id and config.media_id != media_id:
            continue
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


# ---------------------------------------------------------------------------
# Simple in-memory cache for tenant resolution (phone_number_id -> tenant_id)
# ---------------------------------------------------------------------------

_tenant_cache: dict[str, tuple[str, float]] = {}
_TENANT_CACHE_TTL = 300  # 5 minutes


async def _get_tenant_by_phone_id_cached(
    phone_number_id: str, db: AsyncSession
) -> tuple[MetaConnection | None, Account | None]:
    now = time.time()
    cached = _tenant_cache.get(phone_number_id)
    if cached:
        tenant_id, expires = cached
        if now < expires:
            acc_result = await db.execute(select(Account).where(Account.id == tenant_id))
            account = acc_result.scalar_one_or_none()
            if account:
                conn_result = await db.execute(
                    select(MetaConnection).where(
                        MetaConnection.account_id == tenant_id,
                        MetaConnection.provider == PROVIDER_WHATSAPP,
                    )
                )
                conn = conn_result.scalar_one_or_none()
                return conn, account

    conn, account = await _resolve_wpp_tenant(phone_number_id, db)
    if account:
        _tenant_cache[phone_number_id] = (account.id, now + _TENANT_CACHE_TTL)
    return conn, account

    return None
