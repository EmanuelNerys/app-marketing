from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LeadResponse(BaseModel):
    id: str
    account_id: str
    name: Optional[str] = None
    instagram_handle: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: str
    status: str
    captured_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None


class AccountResponse(BaseModel):
    id: str
    brand_name: str
    meta_page_id: str
    meta_page_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AccountUpdate(BaseModel):
    brand_name: Optional[str] = None
    is_active: Optional[bool] = None


class AutomationConfigResponse(BaseModel):
    id: str
    account_id: str
    keyword: str
    auto_reply_message: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AutomationConfigUpdate(BaseModel):
    keyword: Optional[str] = None
    auto_reply_message: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    id: str
    account_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    id: str
    account_id: str
    customer_id: str
    amount: float
    description: Optional[str] = None
    status: str
    sold_at: datetime

    class Config:
        from_attributes = True


class DashboardResponse(BaseModel):
    total_leads: int
    total_customers: int
    new_customers_30d: int
    conversion_rate: float
    total_revenue: float
    monthly_revenue: float
    average_ticket: float
    projected_revenue: float
