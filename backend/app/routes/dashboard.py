import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.lead import Lead
from app.models.automation import Customer, Sale
from app.schemas import DashboardResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    total_leads_result = await db.execute(select(func.count(Lead.id)))
    total_leads = total_leads_result.scalar() or 0

    total_customers_result = await db.execute(select(func.count(Customer.id)))
    total_customers = total_customers_result.scalar() or 0

    new_customers_result = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= thirty_days_ago)
    )
    new_customers_30d = new_customers_result.scalar() or 0

    conversion_rate = (total_customers / total_leads * 100) if total_leads > 0 else 0.0

    total_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Sale.amount), 0)).where(Sale.status == "completed")
    )
    total_revenue = float(total_revenue_result.scalar() or 0)

    monthly_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Sale.amount), 0)).where(
            Sale.status == "completed", Sale.sold_at >= thirty_days_ago
        )
    )
    monthly_revenue = float(monthly_revenue_result.scalar() or 0)

    total_sales_result = await db.execute(
        select(func.count(Sale.id)).where(Sale.status == "completed")
    )
    total_sales = total_sales_result.scalar() or 0
    average_ticket = (total_revenue / total_sales) if total_sales > 0 else 0.0

    projected_revenue = monthly_revenue * 12 if monthly_revenue > 0 else 0.0

    return DashboardResponse(
        total_leads=total_leads,
        total_customers=total_customers,
        new_customers_30d=new_customers_30d,
        conversion_rate=round(conversion_rate, 2),
        total_revenue=round(total_revenue, 2),
        monthly_revenue=round(monthly_revenue, 2),
        average_ticket=round(average_ticket, 2),
        projected_revenue=round(projected_revenue, 2),
    )
