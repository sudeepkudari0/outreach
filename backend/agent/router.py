"""
FastAPI router for the agent endpoint.

POST /api/agent/find-and-draft
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
import httpx
from pydantic import BaseModel, Field

from backend.agent.agent import run_agent
from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ── Request / Response Models ────────────────────────────────────────────


class AgentRequest(BaseModel):
    linkedin_url: str = Field(..., description="LinkedIn job URL (e.g. https://linkedin.com/jobs/view/12345)")
    job_id: Optional[str] = Field(None, description="Optional DB job ID to update instead of creating new")


class AgentResponse(BaseModel):
    recruiter_name: str = ""
    recruiter_email: Optional[str] = None
    company: str = ""
    job_title: str = ""
    company_domain: str = ""
    draft_email: str = ""
    status: str = "success"
    errors: Optional[list[str]] = None


# ── Endpoint ─────────────────────────────────────────────────────────────


@router.post("/find-and-draft", response_model=AgentResponse)
async def find_and_draft(request: AgentRequest):
    """
    Given a LinkedIn job URL, scrape the posting, find the recruiter's email,
    and draft a personalized outreach email.
    """
    logger.info(f"Agent request: {request.linkedin_url}")

    try:
        result = await run_agent(linkedin_url=request.linkedin_url, job_id=request.job_id)
    except Exception as e:
        logger.error(f"Agent failed unexpectedly: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    return AgentResponse(
        recruiter_name=result.recruiter_name,
        recruiter_email=result.recruiter_email,
        company=result.company,
        job_title=result.job_title,
        company_domain=result.company_domain,
        draft_email=result.draft_email,
        status=result.status,
        errors=result.errors,
    )


@router.get("/verify-key")
async def verify_api_key():
    """
    Verify if the currently configured Grok API key is valid.
    """
    api_key = getattr(settings, "grok_api_key", None) or getattr(settings, "ai_grok_api_key", None)

    if not api_key:
        raise HTTPException(status_code=400, detail="Grok API Key not configured in .env")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=5.0
            )
            
            if response.status_code == 200:
                return {"status": "success", "detail": "Grok API Key is valid"}
            elif response.status_code == 401:
                raise HTTPException(status_code=401, detail="Invalid Grok API Key")
            else:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Failed to verify key: {response.text}"
                )
    except httpx.RequestError as e:
        logger.error(f"Network error during key verification: {e}")
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")
