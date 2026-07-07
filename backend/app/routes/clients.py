import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db
from app.core.security import get_current_user, hash_password
from app.models.account import Account
from app.models.user import User
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionPlan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/clients", tags=["clients"])


class ClientCreateRequest(BaseModel):
    brand_name: str = Field(..., min_length=2, max_length=255)
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    full_name: str | None = None


class ClientOut(BaseModel):
    id: str
    brand_name: str
    username: str
    full_name: str | None
    is_active: bool
    plan: str = "free"
    created_at: datetime

    class Config:
        from_attributes = True


async def _get_current_subscription_plan(
    account_id: str, db: AsyncSession
) -> str | None:
    """Get the current active plan for an account."""
    result = await db.execute(
        select(Subscription).where(
            and_(
                Subscription.account_id == account_id,
                Subscription.is_active == True,
                Subscription.status == SubscriptionStatus.CONFIRMED,
            )
        ).order_by(Subscription.created_at.desc())
    )
    sub = result.scalars().first()
    return sub.plan if sub else None


async def _require_agency_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ensure the user's tenant is an agency account (plan_type == 'agencia').

    Gated purely by account type, decoupled from the billing plan. Limits per
    plan (nº de clientes etc.) will be enforced later, in the pricing phase.
    """
    account_result = await db.execute(
        select(Account).where(Account.id == current_user.tenant_id)
    )
    account = account_result.scalar_one_or_none()
    if account and account.plan_type == "agencia":
        return account.plan_type

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Apenas contas do tipo Agência podem gerenciar clientes.",
    )


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _plan: str = Depends(_require_agency_plan),
):
    """Agency creates a sub-account (client) under their tenant."""

    # Check username uniqueness
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username já em uso.")

    # Create sub-account linked to the agency.
    # A managed company runs a single business, so it is always "autonomo"
    # (no Clients page, cannot create its own sub-accounts).
    client_account = Account(
        id=str(uuid.uuid4()),
        brand_name=body.brand_name,
        parent_account_id=current_user.tenant_id,
        plan_type="autonomo",
        is_active=True,
    )
    db.add(client_account)
    await db.flush()

    # Create user for the sub-account
    user = User(
        id=str(uuid.uuid4()),
        tenant_id=client_account.id,
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role="admin",
    )
    db.add(user)
    await db.flush()

    # Create free subscription for the client
    sub = Subscription(
        account_id=client_account.id,
        plan=SubscriptionPlan.FREE,
        value=0.0,
        status=SubscriptionStatus.CONFIRMED,
        is_active=True,
        auto_renew=True,
        confirmed_at=datetime.now(timezone.utc),
    )
    db.add(sub)
    await db.commit()

    logger.info(
        "Agency %s created client account %s (user: %s)",
        current_user.tenant_id,
        client_account.id,
        body.username,
    )

    return ClientOut(
        id=client_account.id,
        brand_name=client_account.brand_name,
        username=body.username,
        full_name=body.full_name,
        is_active=True,
        plan="free",
        created_at=client_account.created_at,
    )


@router.get("", response_model=list[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _plan: str = Depends(_require_agency_plan),
):
    """List all sub-accounts (clients) managed by the agency."""
    result = await db.execute(
        select(Account).where(
            Account.parent_account_id == current_user.tenant_id
        ).order_by(Account.created_at.desc())
    )
    accounts = result.scalars().all()

    clients_out = []
    for acc in accounts:
        user_result = await db.execute(
            select(User).where(
                User.tenant_id == acc.id, User.role == "admin"
            ).limit(1)
        )
        admin_user = user_result.scalar_one_or_none()
        plan = await _get_current_subscription_plan(acc.id, db)

        clients_out.append(
            ClientOut(
                id=acc.id,
                brand_name=acc.brand_name,
                username=admin_user.username if admin_user else "—",
                full_name=admin_user.full_name if admin_user else None,
                is_active=acc.is_active,
                plan=plan or "free",
                created_at=acc.created_at,
            )
        )

    return clients_out


@router.post("/{client_id}/impersonate")
async def impersonate_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _plan: str = Depends(_require_agency_plan),
):
    """Generate a token for the agency to access the client's account."""
    result = await db.execute(
        select(Account).where(
            and_(
                Account.id == client_id,
                Account.parent_account_id == current_user.tenant_id,
            )
        )
    )
    client_account = result.scalar_one_or_none()
    if not client_account:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    result = await db.execute(
        select(User).where(
            User.tenant_id == client_account.id, User.role == "admin"
        ).limit(1)
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário do cliente não encontrado.")

    from app.core.security import create_access_token, create_refresh_token

    return {
        "access_token": create_access_token(target_user.id, target_user.tenant_id, "agent"),
        "refresh_token": create_refresh_token(target_user.id, target_user.tenant_id),
        "token_type": "bearer",
        "user_id": target_user.id,
        "tenant_id": target_user.tenant_id,
        "role": "agent",
        "client_brand_name": client_account.brand_name,
    }


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _plan: str = Depends(_require_agency_plan),
):
    """Deactivate a client account."""
    result = await db.execute(
        select(Account).where(
            and_(
                Account.id == client_id,
                Account.parent_account_id == current_user.tenant_id,
            )
        )
    )
    client_account = result.scalar_one_or_none()
    if not client_account:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    client_account.is_active = False
    await db.commit()
    logger.info("Agency %s deactivated client %s", current_user.tenant_id, client_id)
