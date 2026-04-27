"""
Jobs router — CRUD operations for jobs, trigger scrape.
"""

import asyncio
import logging
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.db.models import Job, EmailDraft

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# WebSocket broadcast function (set from main.py)
_ws_broadcast = None


def set_ws_broadcast(fn):
    global _ws_broadcast
    _ws_broadcast = fn


# --- Response models ---


class JobResponse(BaseModel):
    id: str
    title: str
    company: Optional[str] = None
    recruiter_name: Optional[str] = None
    email: str
    source_site: str
    source_url: str
    raw_post_text: str
    source_type: str = "emails"
    notes: Optional[str] = None
    status: str
    created_at: str

    @classmethod
    def from_doc(cls, job: Job) -> "JobResponse":
        return cls(
            id=str(job.id),
            title=job.title,
            company=job.company,
            recruiter_name=job.recruiter_name,
            email=job.email,
            source_site=job.source_site,
            source_url=job.source_url,
            raw_post_text=job.raw_post_text,
            source_type=job.source_type,
            notes=job.notes,
            status=job.status,
            created_at=job.created_at.isoformat(),
        )


class JobWithDraftResponse(JobResponse):
    draft: Optional[dict] = None


class StatusUpdate(BaseModel):
    status: str


class ScrapeRequest(BaseModel):
    site: str  # "linkedin" | "naukri" | "all"
    date_filter: Optional[str] = "r604800"  # r86400, r259200, r604800, r2592000
    location: Optional[str] = None
    source_type: Optional[str] = "emails"  # "emails" | "manual"
    limit: Optional[int] = 5


# --- Endpoints ---


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    status: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
):
    """List all jobs with optional status, site, and source_type filters."""
    query = {}
    if status:
        query["status"] = status
    if site:
        query["source_site"] = site
    if source_type:
        query["source_type"] = source_type

    jobs = await Job.find(query).sort("-created_at").to_list()
    return [JobResponse.from_doc(j) for j in jobs]


@router.get("/{job_id}", response_model=JobWithDraftResponse)
async def get_job(job_id: str):
    """Get a single job with its email draft."""
    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = JobWithDraftResponse(
        id=str(job.id),
        title=job.title,
        company=job.company,
        recruiter_name=job.recruiter_name,
        email=job.email,
        source_site=job.source_site,
        source_url=job.source_url,
        raw_post_text=job.raw_post_text,
        status=job.status,
        created_at=job.created_at.isoformat(),
    )

    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if draft:
        response.draft = {
            "id": str(draft.id),
            "subject": draft.subject,
            "body": draft.body,
            "edited": draft.edited,
            "sent_at": draft.sent_at.isoformat() if draft.sent_at else None,
            "replied_at": draft.replied_at.isoformat() if draft.replied_at else None,
        }

    return response


@router.patch("/{job_id}/status", response_model=JobResponse)
async def update_job_status(job_id: str, update: StatusUpdate):
    """Update a job's status (used by kanban drag-and-drop)."""
    allowed = {"found", "drafted", "approved", "sent", "replied", "ignored", "applied"}
    if update.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(allowed))}",
        )

    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = update.status
    await job.save()
    return JobResponse.from_doc(job)


class NotesUpdate(BaseModel):
    notes: str


@router.patch("/{job_id}/notes", response_model=JobResponse)
async def update_job_notes(job_id: str, update: NotesUpdate):
    """Update a job's notes."""
    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.notes = update.notes
    await job.save()
    return JobResponse.from_doc(job)


@router.post("/scrape")
async def trigger_scrape(request: ScrapeRequest):
    """Trigger a scrape for a given site and wait for completion."""
    from backend.scrapers.linkedin import scrape_linkedin, set_ws_broadcast as set_li_ws
    from backend.scrapers.naukri import scrape_naukri, set_ws_broadcast as set_nk_ws

    if _ws_broadcast:
        set_li_ws(_ws_broadcast)
        set_nk_ws(_ws_broadcast)

    source_type = request.source_type or "emails"
    date_filter = request.date_filter or "r604800"
    limit = request.limit or 5
    location = request.location

    try:
        if request.site in ("linkedin", "all"):
            if _ws_broadcast:
                await _ws_broadcast("[System] Starting LinkedIn scrape...")
            await scrape_linkedin(
                date_filter=date_filter,
                source_type=source_type,
                limit=limit,
                location=location,
            )

        if request.site in ("naukri", "all"):
            if _ws_broadcast:
                await _ws_broadcast("[System] Starting Naukri scrape...")
            await scrape_naukri(
                date_filter=date_filter,
                source_type=source_type,
                limit=limit,
                location=location,                
            )

        if _ws_broadcast:
            await _ws_broadcast("[System] Scrape complete!")
        return {"message": f"Scrape completed for: {request.site}"}
    except Exception as e:
        logger.error(f"Scrape failed: {e}")
        if _ws_broadcast:
            await _ws_broadcast(f"[System] Scrape failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its associated email draft."""
    job = await Job.get(PydanticObjectId(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete associated draft
    draft = await EmailDraft.find_one(EmailDraft.job_id == job_id)
    if draft:
        await draft.delete()

    await job.delete()
    return {"message": "Job and draft deleted"}
