import hashlib
import hmac
import logging

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.models.account import Account

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.get("/meta")
async def verify_webhook(request: Request):
    """
    Verificação do Webhook da Meta (Instagram Graph API).
    A Meta envia um GET com os parâmetros:
      - hub.mode
      - hub.verify_token
      - hub.challenge
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.meta_webhook_verify_token:
            logger.info("Webhook verificado com sucesso.")
            return int(challenge)
        raise HTTPException(status_code=403, detail="Token de verificação inválido.")

    raise HTTPException(status_code=400, detail="Requisição de verificação inválida.")


@router.post("/meta")
async def receive_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Recebe eventos da Meta (Instagram).
    Payload documentado em:
    https://developers.facebook.com/docs/graph-api/webhooks/getting-started
    """
    logger.info("Webhook recebido: %s", payload)

    entry = payload.get("entry", [])
    for item in entry:
        page_id = item.get("id")
        if not page_id:
            continue

        result = await db.execute(
            select(Account).where(Account.meta_page_id == page_id)
        )
        account = result.scalar_one_or_none()
        if not account:
            logger.warning("Nenhuma conta encontrada para page_id: %s", page_id)
            continue

        changes = item.get("changes", [])
        for change in changes:
            field = change.get("field")
            value = change.get("value", {})

            if field == "comments":
                await handle_comment(account, value, db)
            elif field == "messaging":
                await handle_message(account, value, db)

    return {"status": "received"}


async def handle_comment(account: Account, value: dict, db: AsyncSession):
    """
    Processa comentários do Instagram.
    Substituir por lógica real de captura de leads.
    """
    logger.info(
        "Comentário recebido para página %s: %s", account.meta_page_name, value
    )
    return None


async def handle_message(account: Account, value: dict, db: AsyncSession):
    """
    Processa mensagens diretas do Instagram.
    Substituir por lógica real de resposta automática.
    """
    logger.info(
        "Mensagem recebida para página %s: %s", account.meta_page_name, value
    )
    return None
