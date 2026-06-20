import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
from app.routes import auth, webhook, automation, dashboard, leads, accounts, automations, studio, privacy
from app.routes import auth_jwt, conversations, messages, ws, whatsapp, payments

# Register all models with Base.metadata so create_all creates every table
import app.models.meta_connection   # noqa: F401
import app.models.user              # noqa: F401
import app.models.conversation      # noqa: F401
import app.models.message           # noqa: F401
import app.models.subscription      # noqa: F401

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
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for sql in _MIGRATIONS:
            await conn.execute(text(sql))
    yield
    await engine.dispose()


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
app.include_router(payments.router)

# WebSocket (sem prefix /api/v1 — protocolo WS não usa o path prefix)
app.include_router(ws.router)
