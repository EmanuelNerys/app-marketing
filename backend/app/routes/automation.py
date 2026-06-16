import logging

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.account import Account
from app.schemas.automation import AutomationConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/automation", tags=["automation"])


@router.post("/config")
async def save_automation_config(
    config: AutomationConfig,
    db: AsyncSession = Depends(get_db),
):
    """
    Salva a configuração de automação (keyword + mensagem de resposta).
    """
    result = await db.execute(
        select(Account).where(Account.id == config.account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    return {"status": "saved"}
