import logging

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account
from app.schemas.auth import MetaAuthUrlResponse, MetaCallbackResponse
from app.schemas import OnboardingStatusResponse, SelectPlanRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

META_DIALOG_URL = "https://www.facebook.com/v21.0/dialog/oauth"
META_TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token"
META_ME_URL = "https://graph.facebook.com/v21.0/me"
META_GRAPH_URL = "https://graph.facebook.com/v21.0"


@router.get("/meta/login", response_model=MetaAuthUrlResponse)
async def meta_login():
    """
    Gera a URL de autenticação OAuth do Facebook.
    O frontend deve redirecionar o usuário para esta URL.
    """
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": "instagram_basic,instagram_content_publish,pages_read_engagement,pages_manage_metadata,ads_management,ads_read",
        "response_type": "code",
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"{META_DIALOG_URL}?{query_string}"

    return MetaAuthUrlResponse(auth_url=auth_url)


@router.get("/meta/callback", response_model=MetaCallbackResponse)
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
        existing.onboarding_step = 2
        account = existing
    else:
        account = Account(
            brand_name=fb_user_name,
            meta_page_id=page_id,
            meta_page_name=page_name,
            meta_access_token=page_access_token,
            onboarding_step=2,
        )
        db.add(account)

    await db.flush()
    await db.refresh(account)

    return MetaCallbackResponse(
        success=True,
        account_id=account.id,
        brand_name=account.brand_name,
        page_name=account.meta_page_name,
        onboarding_step=account.onboarding_step,
    )


@router.get("/onboarding/status", response_model=OnboardingStatusResponse)
async def onboarding_status(
    account_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    return OnboardingStatusResponse(
        account_id=account.id,
        brand_name=account.brand_name,
        page_name=account.meta_page_name,
        plan_type=account.plan_type,
        onboarding_step=account.onboarding_step,
        instagram_connected=account.onboarding_step >= 2,
        ad_account_selected=account.onboarding_step >= 3,
    )


@router.post("/onboarding/plan")
async def select_plan(
    data: SelectPlanRequest,
    account_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    if data.plan_type not in ("autonomo", "agencia"):
        raise HTTPException(status_code=400, detail="Plano inválido. Escolha 'autonomo' ou 'agencia'.")

    account.plan_type = data.plan_type
    if account.onboarding_step < 1:
        account.onboarding_step = 1

    await db.flush()
    await db.refresh(account)

    return {
        "success": True,
        "plan_type": account.plan_type,
        "onboarding_step": account.onboarding_step,
    }


@router.post("/onboarding/complete-step")
async def complete_step(
    account_id: str = Query(...),
    step: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    if step > account.onboarding_step:
        account.onboarding_step = step
        await db.flush()
        await db.refresh(account)

    return {"success": True, "onboarding_step": account.onboarding_step}


@router.get("/meta/ad-accounts")
async def list_ad_accounts(
    account_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{META_GRAPH_URL}/{account.meta_page_id}/adaccounts",
            params={
                "access_token": account.meta_access_token,
                "fields": "id,name,account_status,currency,amount_spent",
            },
        )
        data = resp.json()

    ad_accounts = data.get("data", [])
    return {
        "ad_accounts": [
            {
                "id": a["id"],
                "name": a.get("name", ""),
                "account_status": a.get("account_status", 0),
                "currency": a.get("currency", "BRL"),
            }
            for a in ad_accounts
        ]
    }
