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

IG_SCOPES = "pages_show_list,pages_read_engagement"


@router.get("/start", response_model=MetaAuthUrlResponse)
async def instagram_start(
    account_id: str = Query(..., description="Tenant account_id"),
):
    state = create_signed_state(account_id, PROVIDER_INSTAGRAM)
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.ig_redirect_uri,
        "scope": IG_SCOPES,
        "response_type": "code",
        "state": state,
    }
    auth_url = f"{settings.meta_dialog_url}?{urlencode(params)}"
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

    # --- Exchange code for short-lived token via Facebook Graph ---
    async with httpx.AsyncClient() as client:
        token_resp = await client.get(
            f"{settings.meta_graph_url}/oauth/access_token",
            params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_oauth_client_secret or settings.meta_app_secret,
                "redirect_uri": settings.ig_redirect_uri,
                "code": code,
            },
        )
    token_data = token_resp.json()
    logger.info("Token exchange response: %s", token_data)
    if "access_token" not in token_data:
        logger.error("Token exchange failed: %s", token_data)
        raise HTTPException(status_code=400, detail=f"Instagram authentication failed: {token_data.get('error', {}).get('message', token_data.get('error_type', 'unknown'))}")

    short_lived_token = token_data["access_token"]

    # --- Exchange for long-lived token (~60 days) ---
    try:
        from datetime import datetime, timezone, timedelta
        async with httpx.AsyncClient() as client:
            ll_resp = await client.get(
                f"{settings.meta_graph_url}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_oauth_client_secret or settings.meta_app_secret,
                    "fb_exchange_token": short_lived_token,
                },
            )
        ll_data = ll_resp.json()
        access_token = ll_data["access_token"]
        expires_in = ll_data.get("expires_in", 5_184_000)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
    except (ValueError, KeyError):
        access_token = short_lived_token
        expires_at = None

    # --- Fetch user info and pages ---
    async with httpx.AsyncClient() as client:
        me_resp = await client.get(
            f"{settings.meta_graph_url}/me",
            params={
                "fields": "id,name,accounts{id,name,access_token,instagram_business_account{id,username,name}}",
                "access_token": access_token,
            },
        )
    me_data = me_resp.json()
    logger.info("Facebook /me response: %s", me_data)

    meta_user_id = me_data.get("id")
    fb_user_name = me_data.get("name", "Unknown")
    pages = me_data.get("accounts", {}).get("data", [])

    if not pages:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma Página do Facebook encontrada. Crie uma Página primeiro.",
        )

    page = pages[0]
    page_id = page["id"]
    page_name = page.get("name", "")
    page_access_token = page.get("access_token", access_token)

    ig_biz_id: str | None = None
    ig_username: str | None = None
    ig_name: str | None = None
    if "instagram_business_account" in page:
        ig_biz = page["instagram_business_account"]
        ig_biz_id = ig_biz.get("id")
        ig_username = ig_biz.get("username")
        ig_name = ig_biz.get("name")

    # --- Verify state and find tenant ---
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

    # --- Upsert MetaConnection ---
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
        url=f"{frontend_url}/app/conexao?instagram=connected&success=true",
        status_code=302,
    )
