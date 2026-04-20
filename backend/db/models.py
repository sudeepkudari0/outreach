"""
Beanie document models for Job and EmailDraft.
"""

from datetime import datetime, timezone
from typing import Optional, Literal

from beanie import Document, Indexed
from pydantic import Field


class Job(Document):
    """A scraped job posting with an extracted recruiter email."""

    title: str
    company: Optional[str] = None
    recruiter_name: Optional[str] = None
    email: Indexed(str, unique=True)  # type: ignore[valid-type]
    source_site: Literal["linkedin", "naukri", "instahyre"]
    source_url: str
    raw_post_text: str
    status: Literal["found", "drafted", "approved", "sent", "replied", "ignored"] = "found"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "jobs"

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Full Stack Developer",
                "company": "Acme Corp",
                "email": "recruiter@acme.com",
                "source_site": "linkedin",
                "source_url": "https://linkedin.com/jobs/view/123",
                "raw_post_text": "We are looking for...",
                "status": "found",
            }
        }


class EmailDraft(Document):
    """AI-generated email draft linked to a Job."""

    job_id: str  # PydanticObjectId as string for easier serialization
    subject: Optional[str] = None
    body: Optional[str] = None
    edited: bool = False
    sent_at: Optional[datetime] = None
    replied_at: Optional[datetime] = None

    class Settings:
        name = "email_drafts"
