"""
Controle de módulos por conta.

A agência-mãe pode bloquear módulos das empresas-clientes (contas
"dependente") — ex.: esconder/derrubar o módulo inteiro de WhatsApp para um
cliente. O super admin (SUPER_ADMIN_EMAILS no .env) pode fazer o mesmo com
QUALQUER conta.

Enforcement em duas camadas:
  - Backend: `require_module("<módulo>")` como dependência de router → 403.
  - Frontend: /auth/me expõe blocked_modules e a sidebar/rotas se escondem.
"""
import logging

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.account import Account
from app.models.user import User

logger = logging.getLogger(__name__)

# Módulos que podem ser bloqueados por conta
AVAILABLE_MODULES: dict[str, str] = {
    "whatsapp": "WhatsApp (atendimento, templates, follow-ups)",
    "instagram": "Instagram (publicar, automação, direct)",
    "ads": "Meta Ads (campanhas e métricas)",
    "ia": "IA de atendimento (Gemini + RAG)",
}


def is_super_admin(user: User) -> bool:
    """Super admin do SISTEMA — emails na env SUPER_ADMIN_EMAILS (o username é o email)."""
    allowed = {e.strip().lower() for e in settings.super_admin_emails.split(",") if e.strip()}
    return bool(allowed) and (user.username or "").lower() in allowed


async def get_blocked_modules(db: AsyncSession, account_id: str) -> list[str]:
    account = (await db.execute(
        select(Account.blocked_modules).where(Account.id == account_id)
    )).scalar_one_or_none()
    return list(account or [])


def require_module(module: str):
    """Dependência de router: 403 se o módulo estiver bloqueado para o tenant."""

    async def _guard(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        blocked = await get_blocked_modules(db, current_user.tenant_id)
        if module in blocked:
            raise HTTPException(
                status_code=403,
                detail=f"O módulo '{AVAILABLE_MODULES.get(module, module)}' está desativado "
                       "para esta conta. Fale com a sua agência.",
            )

    return _guard
