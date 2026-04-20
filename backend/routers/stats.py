"""
Stats router — analytics: sent count, reply rate, per-site breakdown.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import settings
from backend.db.models import Job, EmailDraft

router = APIRouter(prefix="/api/stats", tags=["stats"])


class SiteStats(BaseModel):
    found: int = 0
    sent: int = 0


class DailyCount(BaseModel):
    date: str
    count: int


class StatsResponse(BaseModel):
    total_found: int
    total_drafted: int
    total_sent: int
    total_replied: int
    reply_rate: float
    sent_today: int
    daily_limit: int
    by_site: dict[str, SiteStats]
    sent_per_day: list[DailyCount]


@router.get("", response_model=StatsResponse)
async def get_stats():
    """Return comprehensive analytics data."""
    # Total counts by status
    total_found = await Job.find().count()
    total_drafted = await Job.find(Job.status == "drafted").count()
    total_sent = await Job.find(Job.status == "sent").count()
    total_replied = await Job.find(Job.status == "replied").count()

    # Reply rate
    reply_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0.0

    # Sent today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    sent_today = await EmailDraft.find(
        EmailDraft.sent_at >= today_start,
        EmailDraft.sent_at != None,
    ).count()

    # Per-site breakdown
    by_site = {}
    for site in ["linkedin", "naukri", "instahyre"]:
        found = await Job.find(Job.source_site == site).count()
        sent = await Job.find(Job.source_site == site, Job.status == "sent").count()
        if found > 0:
            by_site[site] = SiteStats(found=found, sent=sent)

    # Sent per day (last 30 days)
    sent_per_day = []
    for i in range(30):
        day = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) - timedelta(days=i)
        next_day = day + timedelta(days=1)

        count = await EmailDraft.find(
            EmailDraft.sent_at >= day,
            EmailDraft.sent_at < next_day,
        ).count()

        sent_per_day.append(DailyCount(date=day.strftime("%Y-%m-%d"), count=count))

    sent_per_day.reverse()  # Chronological order

    return StatsResponse(
        total_found=total_found,
        total_drafted=total_drafted,
        total_sent=total_sent,
        total_replied=total_replied,
        reply_rate=round(reply_rate, 1),
        sent_today=sent_today,
        daily_limit=settings.daily_send_limit,
        by_site=by_site,
        sent_per_day=sent_per_day,
    )
