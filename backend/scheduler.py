"""
APScheduler setup — daily scrape + draft generation.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def run_daily_scrape() -> None:
    """
    Daily scrape job — runs LinkedIn then Naukri sequentially.
    Generates email drafts for all new jobs found.
    """
    logger.info("Starting daily scheduled scrape...")

    total_new = 0

    try:
        from backend.scrapers.linkedin import scrape_linkedin

        linkedin_count = await scrape_linkedin()
        total_new += linkedin_count
        logger.info(f"LinkedIn scrape complete: {linkedin_count} new jobs")
    except Exception as e:
        logger.error(f"LinkedIn scrape failed: {e}")

    try:
        from backend.scrapers.naukri import scrape_naukri

        naukri_count = await scrape_naukri()
        total_new += naukri_count
        logger.info(f"Naukri scrape complete: {naukri_count} new jobs")
    except Exception as e:
        logger.error(f"Naukri scrape failed: {e}")

    logger.info(f"Daily scrape complete. Total new jobs: {total_new}")


def start_scheduler() -> None:
    """Initialize and start the scheduler with daily scrape job."""
    scheduler.add_job(
        run_daily_scrape,
        trigger=CronTrigger(hour=settings.scrape_schedule_hour, minute=0),
        id="daily_scrape",
        name="Daily Job Scrape",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started. Daily scrape scheduled at {settings.scrape_schedule_hour}:00"
    )


def stop_scheduler() -> None:
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")
