import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
from app.routes import auth, webhook, automation, dashboard, leads, accounts, automations, studio, privacy, instagram, instagram_api
from app.routes import auth_jwt, conversations, messages, ws, whatsapp, payments, tenants, clients
from app.routes import auth_email
from app.routes import marketing

# Register all models with Base.metadata so create_all creates every table
import app.models.meta_connection   # noqa: F401
import app.models.user              # noqa: F401
import app.models.conversation      # noqa: F401
import app.models.message           # noqa: F401
import app.models.subscription      # noqa: F401
import app.models.schedule          # noqa: F401

logging.basicConfig(level=logging.INFO)


_MIGRATIONS = [
    # Add WhatsApp-specific columns to meta_connections (safe — IF NOT EXISTS)
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(100)",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30)",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS meta_templates JSON",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS conv_count_marketing INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS conv_count_utility INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS conv_count_service INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS conv_count_auth INTEGER NOT NULL DEFAULT 0",
    # Index for fast webhook routing by phone_number_id
    "CREATE INDEX IF NOT EXISTS ix_meta_conn_phone_number_id ON meta_connections (phone_number_id)",
    # Customer email for pre-payment accounts
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)",
    # Customer name for pre-payment accounts
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)",
    # Parent account for sub-tenants (agency model)
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_id VARCHAR(36)",
    "CREATE INDEX IF NOT EXISTS ix_accounts_parent_id ON accounts (parent_account_id)",
    # Email verification & password reset
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for sql in _MIGRATIONS:
            await conn.execute(text(sql))

    scheduler_task = asyncio.create_task(_start_scheduler())

    yield

    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


async def _start_scheduler():
    from app.services.scheduler import scheduler_loop
    await scheduler_loop()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Meta / legacy onboarding
app.include_router(auth.router, prefix="/api/v1")
app.include_router(webhook.router, prefix="/api/v1")
app.include_router(automation.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(accounts.router, prefix="/api/v1")
app.include_router(automations.router, prefix="/api/v1")
app.include_router(studio.router, prefix="/api/v1")
app.include_router(privacy.router, prefix="/api/v1")

# JWT auth + multi-tenant chat
app.include_router(auth_jwt.router, prefix="/api/v1")
app.include_router(conversations.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(whatsapp.router, prefix="/api/v1")
app.include_router(tenants.router, prefix="/api/v1")
app.include_router(payments.router)
app.include_router(clients.router, prefix="/api/v1")

# Instagram Login
app.include_router(instagram.router, prefix="/api/v1")

# Instagram API (publish, schedule, media, insights)
app.include_router(instagram_api.router, prefix="/api/v1")

# Email auth (forgot password, verify email)
app.include_router(auth_email.router, prefix="/api/v1")

# Marketing API (campaigns, ad sets, creatives, ads)
app.include_router(marketing.router, prefix="/api/v1")

# WebSocket (sem prefix /api/v1 — não usa path prefix)
app.include_router(ws.router)
