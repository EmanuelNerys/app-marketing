import logging
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account
from app.models.meta_connection import (
    MetaConnection,
    PROVIDER_INSTAGRAM,
    STATUS_ACTIVE,
)
from app.schemas.auth import MetaAuthUrlResponse
from app.services.meta_token_service import (
    encrypt_token,
    create_signed_state, verify_signed_state,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/instagram", tags=["instagram"])

# Instagram Business Login — endpoint diferente do Facebook Login
IG_AUTH_URL = "https://www.instagram.com/oauth/authorize"
IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
IG_GRAPH_URL = "https://graph.instagram.com/v21.0"

IG_SCOPES = (
    "instagram_business_basic,"
    "instagram_business_manage_messages,"
    "instagram_business_manage_comments"
)


@router.get("/start", response_model=MetaAuthUrlResponse)
async def instagram_start(
    account_id: str = Query(..., description="Tenant account_id"),
):
    state = create_signed_state(account_id, PROVIDER_INSTAGRAM)
    params = {
        "client_id": settings.ig_app_id or settings.meta_app_id,
        "redirect_uri": settings.ig_redirect_uri,
        "scope": IG_SCOPES,
        "response_type": "code",
        "state": state,
    }
    auth_url = f"{IG_AUTH_URL}?{urlencode(params)}"
    return MetaAuthUrlResponse(auth_url=auth_url)


@router.get("/callback")
async def instagram_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if error:
        raise HTTPException(
            status_code=400,
            detail=f"Instagram OAuth denied: {error_description or error}",
        )
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")

    # Troca code por short-lived token (POST multipart/form-data como a doc do Instagram mostra)
    used_app_id = settings.ig_app_id or settings.meta_app_id
    used_secret = settings.ig_app_secret or settings.meta_app_secret
    logger.info(
        "IG token exchange — client_id=%s secret_len=%s redirect_uri=%r code_prefix=%s",
        used_app_id, len(used_secret or ""), settings.ig_redirect_uri, (code or "")[:20],
    )
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            IG_TOKEN_URL,
            files={
                "client_id": (None, used_app_id),
                "client_secret": (None, used_secret),
                "grant_type": (None, "authorization_code"),
                "redirect_uri": (None, settings.ig_redirect_uri),
                "code": (None, code),
            },
        )
    logger.info("IG token resp status=%s body=%s", token_resp.status_code, token_resp.text)
    token_data = token_resp.json()

    if "access_token" not in token_data:
        logger.error("IG token exchange failed: %s", token_data)
        raise HTTPException(
            status_code=400,
            detail=f"Instagram authentication failed: {token_data.get('error_message', token_data.get('error', 'unknown'))}",
        )

    short_lived_token = token_data["access_token"]
    ig_user_id_fallback = str(token_data.get("user_id", ""))

    # Troca por long-lived token (~60 dias) via Instagram Graph
    from datetime import datetime, timezone, timedelta
    async with httpx.AsyncClient() as client:
        ll_resp = await client.get(
            f"{IG_GRAPH_URL}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_id": settings.ig_app_id or settings.meta_app_id,
                "client_secret": settings.ig_app_secret or settings.meta_app_secret,
                "access_token": short_lived_token,
            },
        )
    ll_data = ll_resp.json()
    logger.info("IG long-lived exchange status=%s body=%s", ll_resp.status_code, ll_data)
    if "access_token" not in ll_data:
        logger.error("IG long-lived token exchange failed — storing short-lived token as fallback: %s", ll_data)
    access_token = ll_data.get("access_token", short_lived_token)
    expires_in = ll_data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

    # Busca dados da conta Instagram
    async with httpx.AsyncClient() as client:
        me_resp = await client.get(
            f"{IG_GRAPH_URL}/me",
            params={
                "fields": "id,username,name",
                "access_token": access_token,
            },
        )
    me_data = me_resp.json()
    logger.info("Instagram /me: %s", me_data)

    ig_biz_id = me_data.get("id") or ig_user_id_fallback
    ig_username = me_data.get("username")

    # Verifica state e acha o tenant
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter.")

    try:
        state_payload = verify_signed_state(state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    tenant_account_id = state_payload["account_id"]

    result = await db.execute(select(Account).where(Account.id == tenant_account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    # Upsert MetaConnection
    conn_result = await db.execute(
        select(MetaConnection).where(
            MetaConnection.account_id == tenant_account_id,
            MetaConnection.provider == PROVIDER_INSTAGRAM,
        )
    )
    connection = conn_result.scalar_one_or_none()
    encrypted_token = encrypt_token(access_token)

    if connection:
        connection.access_token_encrypted = encrypted_token
        connection.meta_user_id = ig_biz_id
        connection.ig_business_account_id = ig_biz_id
        connection.scopes = IG_SCOPES
        connection.status = STATUS_ACTIVE
    else:
        connection = MetaConnection(
            account_id=tenant_account_id,
            provider=PROVIDER_INSTAGRAM,
            meta_user_id=ig_biz_id,
            ig_business_account_id=ig_biz_id,
            access_token_encrypted=encrypted_token,
            token_type="long_lived",
            scopes=IG_SCOPES,
            status=STATUS_ACTIVE,
        )
        db.add(connection)

    await db.flush()
    await db.refresh(account)

    frontend_url = "http://localhost:5173"
    return RedirectResponse(
        url=f"{frontend_url}/oauth/success?provider=instagram&username={ig_username or ''}",
        status_code=302,
    )
