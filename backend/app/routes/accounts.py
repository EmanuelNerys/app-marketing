import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.account import Account
from app.schemas import AccountResponse, AccountUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=List[AccountResponse])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).order_by(Account.created_at.desc()))
    return result.scalars().all()


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    return account


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: str, data: AccountUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    await db.flush()
    await db.refresh(account)
    return account


@router.delete("/{account_id}")
async def delete_account(account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    await db.delete(account)
    await db.flush()
    return {"detail": "Conta removida"}
