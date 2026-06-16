import logging

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account
from app.schemas.auth import MetaAuthUrlResponse, MetaCallbackResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/meta", tags=["auth"])

META_DIALOG_URL = "https://www.facebook.com/v21.0/dialog/oauth"
META_TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token"
META_ME_URL = "https://graph.facebook.com/v21.0/me"


@router.get("/login", response_model=MetaAuthUrlResponse)
async def meta_login():
    """
    Gera a URL de autenticação OAuth do Facebook.
    O frontend deve redirecionar o usuário para esta URL.
    """
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": "instagram_basic,instagram_content_publish,pages_read_engagement,pages_manage_metadata",
        "response_type": "code",
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"{META_DIALOG_URL}?{query_string}"

    return MetaAuthUrlResponse(auth_url=auth_url)


@router.get("/callback", response_model=MetaCallbackResponse)
async def meta_callback(code: str, db: AsyncSession = Depends(get_db)):
    """
    Troca o código de autorização por um token de acesso de longa duração
    e salva/atualiza a conta no banco.
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.get(
            META_TOKEN_URL,
            params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "redirect_uri": settings.meta_redirect_uri,
                "code": code,
            },
        )
        token_data = token_resp.json()

        if "access_token" not in token_data:
            logger.error("Erro ao obter token: %s", token_data)
            raise HTTPException(status_code=400, detail="Falha na autenticação com a Meta.")

        access_token = token_data["access_token"]

        me_resp = await client.get(
            META_ME_URL,
            params={
                "fields": "id,name,pages",
                "access_token": access_token,
            },
        )
        me_data = me_resp.json()
        logger.info("Dados do usuário Meta: %s", me_data)

    fb_user_id = me_data.get("id")
    fb_user_name = me_data.get("name", "Unknown")
    pages = me_data.get("pages", {}).get("data", [])

    if not pages:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma página do Facebook/Instagram encontrada. Crie uma página primeiro.",
        )

    page = pages[0]
    page_id = page["id"]
    page_name = page.get("name", "")
    page_access_token = page.get("access_token", access_token)

    result = await db.execute(
        select(Account).where(Account.meta_page_id == page_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.meta_access_token = page_access_token
        existing.meta_page_name = page_name
        existing.brand_name = fb_user_name
        account = existing
    else:
        account = Account(
            brand_name=fb_user_name,
            meta_page_id=page_id,
            meta_page_name=page_name,
            meta_access_token=page_access_token,
        )
        db.add(account)

    await db.flush()
    await db.refresh(account)

    return MetaCallbackResponse(
        success=True,
        account_id=account.id,
        brand_name=account.brand_name,
        page_name=account.meta_page_name,
    )
