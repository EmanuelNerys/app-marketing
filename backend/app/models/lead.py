import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

import enum


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    CONVERTED = "converted"
    LOST = "lost"


class LeadSource(str, enum.Enum):
    INSTAGRAM_COMMENT = "instagram_comment"
    INSTAGRAM_DM = "instagram_dm"
    INSTAGRAM_FORM = "instagram_form"
    MANUAL = "manual"


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    account_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    instagram_handle: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    source: Mapped[LeadSource] = mapped_column(
        SAEnum(LeadSource, name="lead_source", create_constraint=True),
        nullable=False,
    )
    status: Mapped[LeadStatus] = mapped_column(
        SAEnum(LeadStatus, name="lead_status", create_constraint=True),
        default=LeadStatus.NEW,
        nullable=False,
    )
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
