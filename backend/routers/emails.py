"""
Emails router — draft management, approve, send.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import settings
from backend.db.models import Job, EmailDraft
from backend.ai.email_writer import generate_email_draft
from backend.mailer.sender import send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])


# --- Request / Response models ---


class DraftResponse(BaseModel):
    id: str
    job_id: str
    subject: Optional[str] = None
    body: Optional[str] = None
    edited: bool = False
    sent_at: Optional[str] = None
    replied_at: Optional[str] = None

    @classmethod
    def from_doc(cls, draft: EmailDraft) -> "DraftResponse":
        return cls(
            id=str(draft.id),
            job_id=draft.job_id,
            subject=draft.subject,
            body=draft.body,
            edited=draft.edited,
            sent_at=draft.sent_at.isoformat() if draft.sent_at else None,
            replied_at=draft.replied_at.isoformat() if draft.replied_at else None,
        )


class DraftUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None


class SendPayload(BaseModel):
    to_email: Optional[str] = None


# --- Helper ---


async def _get_today_send_count() -> int:
    """Count emails sent today."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count = await EmailDraft.find(
        EmailDraft.sent_at >= today_start,
        EmailDraft.sent_at != None,
    ).count()
    return count


# --- Endpoints ---


@router.get("/{job_id}", response_model=DraftResponse)
async def get_draft(job_id: str):
    """Get the email draft for a job."""
    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found for this job")
    return DraftResponse.from_doc(draft)


@router.put("/{job_id}", response_model=DraftResponse)
async def update_draft(job_id: str, update: DraftUpdate):
    """Update a draft's subject and/or body. Sets edited=True."""
    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found for this job")

    if update.subject is not None:
        draft.subject = update.subject
    if update.body is not None:
        draft.body = update.body
    draft.edited = True
    await draft.save()

    return DraftResponse.from_doc(draft)


@router.post("/{job_id}/regenerate", response_model=DraftResponse)
async def regenerate_draft(job_id: str):
    """Re-generate the email draft using AI."""
    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)

    draft_data = await generate_email_draft(job)

    if draft:
        draft.subject = draft_data["subject"]
        draft.body = draft_data["body"]
        draft.edited = False
        await draft.save()
    else:
        draft = EmailDraft(
            job_id=job_id,
            subject=draft_data["subject"],
            body=draft_data["body"],
        )
        await draft.insert()

    # Update job status to drafted
    if job.status == "found":
        job.status = "drafted"
        await job.save()

    return DraftResponse.from_doc(draft)


@router.post("/{job_id}/approve")
async def approve_draft(job_id: str):
    """Approve a draft — sets job status to 'approved'."""
    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    job.status = "approved"
    await job.save()

    return {"message": "Draft approved", "job_id": job_id}


@router.post("/{job_id}/send")
async def send_draft(job_id: str, payload: Optional[SendPayload] = None):
    """Send an email for a specific job. Enforces daily send limit."""
    # Check daily limit
    sent_today = await _get_today_send_count()
    if sent_today >= settings.daily_send_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily send limit reached ({settings.daily_send_limit}). Try again tomorrow.",
        )

    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if not draft or not draft.subject or not draft.body:
        raise HTTPException(status_code=400, detail="Draft is missing subject or body")

    target_email = job.email
    if payload and payload.to_email:
        target_email = payload.to_email

    if not target_email:
        raise HTTPException(status_code=400, detail="No target email address available")

    # Send the email
    message_id = await send_email(
        to=target_email,
        subject=draft.subject,
        body=draft.body,
    )

    # Update statuses
    draft.sent_at = datetime.now(timezone.utc)
    await draft.save()

    job.status = "sent"
    if payload and payload.to_email and payload.to_email != job.email:
        job.email = payload.to_email
    await job.save()

    return {
        "message": "Email sent successfully",
        "gmail_message_id": message_id,
        "to": target_email,
    }


@router.post("/send-all-approved")
async def send_all_approved():
    """
    Send all approved emails in sequence with 30-second delays.
    Respects the daily send limit.
    """
    sent_today = await _get_today_send_count()
    remaining = settings.daily_send_limit - sent_today

    if remaining <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily send limit reached ({settings.daily_send_limit}).",
        )

    approved_jobs = await Job.find(Job.status == "approved").to_list()

    if not approved_jobs:
        return {"message": "No approved emails to send", "sent": 0}

    sent_count = 0
    errors = []

    for job in approved_jobs:
        if sent_count >= remaining:
            break

        draft = await EmailDraft.find_one(EmailDraft.job_id == str(job.id))
        if not draft or not draft.subject or not draft.body:
            errors.append(f"Skipped {job.email}: missing draft")
            continue

        try:
            message_id = await send_email(
                to=job.email,
                subject=draft.subject,
                body=draft.body,
            )

            draft.sent_at = datetime.now(timezone.utc)
            await draft.save()
            job.status = "sent"
            await job.save()

            sent_count += 1
            logger.info(f"Sent email to {job.email} ({sent_count}/{remaining})")

            # 30-second delay to look human (except after last email)
            if sent_count < remaining and sent_count < len(approved_jobs):
                await asyncio.sleep(30)

        except Exception as e:
            logger.error(f"Failed to send to {job.email}: {e}")
            errors.append(f"Failed {job.email}: {str(e)}")

    return {
        "message": f"Sent {sent_count} emails",
        "sent": sent_count,
        "errors": errors,
        "remaining_today": remaining - sent_count,
    }
