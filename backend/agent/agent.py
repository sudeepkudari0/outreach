"""
Agent orchestrator — coordinates the tools to process a job outreach request.

Given a LinkedIn job URL, this module:
1. Scrapes the job page for details (crawlee + playwright)
2. Finds the recruiter email (pattern generation + SMTP verification)
3. Drafts a cold outreach email (Grok/Ollama + resume)
4. Returns the aggregated result
"""

import logging
from dataclasses import dataclass
from typing import Optional

from backend.agent.tools.scraper import scrape_job_page
from backend.agent.tools.email_finder import find_email
from backend.agent.tools.drafter import draft_outreach_email
from backend.config import settings
from backend.db.models import Job, EmailDraft

from beanie import PydanticObjectId

logger = logging.getLogger(__name__)


@dataclass
class AgentResult:
    """Final output of the agent pipeline."""

    recruiter_name: str = ""
    recruiter_email: Optional[str] = None
    company: str = ""
    job_title: str = ""
    company_domain: str = ""
    draft_email: str = ""
    status: str = "success"  # "success" | "email_not_found" | "scrape_failed"
    errors: list[str] | None = None


async def run_agent(linkedin_url: str, job_id: Optional[str] = None) -> AgentResult:
    """
    Main agent loop. Orchestrates scraping → email finding → drafting.

    Returns an AgentResult with all gathered information.
    """
    result = AgentResult()

    # ── Step 1: Scrape the job page ──────────────────────────────────────
    logger.info(f"Step 1: Scraping job page — {linkedin_url}")

    try:
        job = await scrape_job_page(linkedin_url)
    except ValueError as e:
        # Invalid URL
        result.status = "scrape_failed"
        result.errors = [str(e)]
        logger.error(f"Invalid URL: {e}")
        return result
    except Exception as e:
        result.status = "scrape_failed"
        result.errors = [f"Scraping failed: {str(e)}"]
        logger.error(f"Scraping error: {e}")
        return result

    if not job.is_valid:
        result.status = "scrape_failed"
        result.errors = job.errors or ["Could not extract job details from LinkedIn"]
        logger.warning(f"Scrape returned incomplete data: {job.errors}")
        return result

    result.job_title = job.job_title
    result.company = job.company
    result.company_domain = job.company_domain
    result.recruiter_name = job.recruiter_name

    logger.info(
        f"Scraped: {job.job_title} at {job.company} "
        f"(recruiter: {job.recruiter_name or 'unknown'}, domain: {job.company_domain or 'unknown'})"
    )

    # ── Step 2: Find recruiter email ─────────────────────────────────────
    logger.info("Step 2: Finding recruiter email")

    if job.recruiter_name and job.company_domain:
        email, email_status = await find_email(job.recruiter_name, job.company_domain)
        result.recruiter_email = email

        if email_status == "not_found":
            result.status = "email_not_found"
            logger.warning("Could not find recruiter email")
    elif not job.recruiter_name:
        logger.warning("No recruiter name found — skipping email lookup")
        result.status = "email_not_found"
    elif not job.company_domain:
        logger.warning("No company domain found — skipping email lookup")
        result.status = "email_not_found"

    # ── Step 3: Draft outreach email ─────────────────────────────────────
    logger.info("Step 3: Drafting outreach email")

    try:
        result.draft_email = await draft_outreach_email(
            recruiter_name=job.recruiter_name or "Hiring Manager",
            company=job.company,
            job_title=job.job_title,
            my_name=settings.my_name,
            my_background=f"{settings.my_role}. {settings.my_skills}. {settings.my_experience_years} years experience.",
        )
    except Exception as e:
        logger.error(f"Drafting failed: {e}")
        result.draft_email = ""
        if result.errors is None:
            result.errors = []
        result.errors.append(f"Email drafting failed: {str(e)}")

    # ── Step 4: Save to Database ─────────────────────────────────────────
    logger.info("Step 4: Saving results to database")
    
    # We need a unique email or a placeholder to save the job
    db_email = result.recruiter_email or f"agent-{linkedin_url}"
    
    existing_job = None
    try:
        # Check if job exists by explicit ID provided by frontend
        if job_id:
            existing_job = await Job.get(PydanticObjectId(job_id))
        
        if not existing_job:
            # Fallback check by email (to avoid uniqueness crashes)
            existing_job = await Job.find_one(Job.email == db_email)
            
        if not existing_job:
            new_job = Job(
                title=job.job_title,
                company=job.company,
                company_domain=job.company_domain,
                recruiter_name=job.recruiter_name,
                email=db_email,
                source_site="linkedin",
                source_url=linkedin_url,
                raw_post_text=job.job_description or f"LinkedIn Job: {job.job_title}",
                source_type="agent",
                status="drafted" if result.draft_email else "found",
            )
            await new_job.insert()
            target_job_id = str(new_job.id)
            logger.info(f"Saved new job to DB: ID={target_job_id}")
        else:
            existing_job.title = job.job_title or existing_job.title
            existing_job.company = job.company or existing_job.company
            existing_job.company_domain = job.company_domain or existing_job.company_domain
            existing_job.recruiter_name = job.recruiter_name or existing_job.recruiter_name
            existing_job.email = db_email
            existing_job.status = "drafted" if result.draft_email else existing_job.status
            await existing_job.save()
            target_job_id = str(existing_job.id)
            logger.info(f"Updated existing job in DB: ID={target_job_id}")

        if result.draft_email:
            # Upsert the Draft (delete old if exists)
            await EmailDraft.find(EmailDraft.job_id == target_job_id).delete()
            draft = EmailDraft(
                job_id=target_job_id,
                subject=result.draft_email.split("\n\n")[0].replace("Subject: ", ""),
                body="\n\n".join(result.draft_email.split("\n\n")[1:]),
            )
            await draft.insert()
            logger.info(f"Saved email draft for job {target_job_id}")

    except Exception as e:
        logger.error(f"Failed to save job/draft to DB: {e}")
        if result.errors is None:
            result.errors = []
        result.errors.append(f"DB save failed: {str(e)}")

    logger.info(f"Agent completed — status: {result.status}")
    return result
