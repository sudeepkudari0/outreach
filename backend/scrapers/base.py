"""
Shared scraper utilities — email regex extraction and deduplication.
"""

import re
import logging
from typing import Optional

from backend.db.models import Job

logger = logging.getLogger(__name__)

# Regex to match email addresses
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# Domains to filter out — not recruiter emails
BLOCKED_DOMAINS = {
    "linkedin.com",
    "naukri.com",
    "indeed.com",
    "glassdoor.com",
    "monster.com",
    "instahyre.com",
}

BLOCKED_PREFIXES = {
    "noreply",
    "no-reply",
    "support",
    "info",
    "help",
    "admin",
    "webmaster",
    "postmaster",
    "mailer-daemon",
    "donotreply",
    "do-not-reply",
    "feedback",
    "notifications",
    "alerts",
}


def extract_emails(text: str) -> list[str]:
    """
    Extract valid recruiter email addresses from raw text.
    Filters out known non-recruiter domains and prefixes.
    Returns deduplicated list.
    """
    raw_matches = EMAIL_REGEX.findall(text)
    valid_emails: list[str] = []
    seen: set[str] = set()

    for email in raw_matches:
        email_lower = email.lower()

        # Skip duplicates
        if email_lower in seen:
            continue
        seen.add(email_lower)

        # Skip blocked domains
        domain = email_lower.split("@")[1]
        if any(blocked in domain for blocked in BLOCKED_DOMAINS):
            continue

        # Skip blocked prefixes
        prefix = email_lower.split("@")[0]
        if prefix in BLOCKED_PREFIXES:
            continue

        valid_emails.append(email_lower)

    return valid_emails


async def is_email_duplicate(email: str) -> bool:
    """Check if a job with this email already exists in the database."""
    existing = await Job.find_one(Job.email == email)
    return existing is not None


async def save_job_if_new(
    title: str,
    company: Optional[str],
    recruiter_name: Optional[str],
    email: str,
    source_site: str,
    source_url: str,
    raw_post_text: str,
) -> Optional[Job]:
    """
    Save a new Job document if the email doesn't already exist.
    Returns the Job if saved, None if duplicate.
    """
    if await is_email_duplicate(email):
        logger.info(f"Skipping duplicate email: {email}")
        return None

    job = Job(
        title=title,
        company=company,
        recruiter_name=recruiter_name,
        email=email,
        source_site=source_site,
        source_url=source_url,
        raw_post_text=raw_post_text,
    )

    try:
        await job.insert()
        logger.info(f"Saved new job: {title} at {company} ({email})")
        return job
    except Exception as e:
        # Handle race condition on unique index
        if "duplicate key" in str(e).lower():
            logger.info(f"Duplicate key on insert for email: {email}")
            return None
        raise
