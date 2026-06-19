import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Allowed values for provider and status columns
PROVIDER_INSTAGRAM = "instagram"
PROVIDER_WHATSAPP = "whatsapp"
PROVIDER_ADS = "ads"
PROVIDERS = (PROVIDER_INSTAGRAM, PROVIDER_WHATSAPP, PROVIDER_ADS)

STATUS_ACTIVE = "active"
STATUS_EXPIRED = "expired"
STATUS_NEEDS_REAUTH = "needs_reauth"
STATUS_REVOKED = "revoked"


class MetaConnection(Base):
    __tablename__ = "meta_connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)

    # Discovered identifiers — filled during OAuth callback
    meta_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ig_business_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    waba_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ad_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Token stored encrypted with Fernet
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    token_type: Mapped[str] = mapped_column(String(50), nullable=False, default="long_lived")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Comma-separated OAuth scopes granted
    scopes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=STATUS_ACTIVE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # One active connection per (account, provider) pair
        Index("ix_meta_conn_account_provider", "account_id", "provider"),
        # Lookup by Meta-side identifiers for webhook routing
        Index("ix_meta_conn_page_id", "page_id"),
        Index("ix_meta_conn_ig_biz", "ig_business_account_id"),
        Index("ix_meta_conn_waba", "waba_id"),
    )
