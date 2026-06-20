import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.account import Account
from app.models.automation import AutomationConfig
from app.schemas.automation import AutomationConfig as AutomationConfigSchema

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/automation", tags=["automation"])


@router.post("/config")
async def save_automation_config(
    config: AutomationConfigSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Account).where(Account.id == current_user.tenant_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    db_config = AutomationConfig(
        id=str(uuid.uuid4()),
        account_id=current_user.tenant_id,
        keyword=config.keyword,
        response_message=config.response_message,
        send_dm=config.send_dm,
        is_active=config.is_active,
    )
    db.add(db_config)
    await db.flush()
    await db.refresh(db_config)
    return {"id": db_config.id, "status": "saved"}