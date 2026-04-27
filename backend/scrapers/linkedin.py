"""
LinkedIn job scraper using Crawlee's PlaywrightCrawler.
Handles cookie-based session authentication and job detail extraction.
"""

import asyncio
import json
import logging
import os
import random
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext
from crawlee.storages import RequestQueue
from playwright.async_api import BrowserContext

from backend.ai.email_writer import generate_email_draft
from backend.config import settings
from backend.db.models import EmailDraft
from backend.scrapers.base import extract_emails, save_job_if_new

logger = logging.getLogger(__name__)

_ws_broadcast: Optional[callable] = None


def set_ws_broadcast(fn: callable) -> None:
    global _ws_broadcast
    _ws_broadcast = fn


async def _log(message: str) -> None:
    """Log a message and broadcast via WebSocket if available."""
    logger.info(message)
    if _ws_broadcast:
        await _ws_broadcast(f"[LinkedIn] {message}")


async def _log_data(label: str, data: dict) -> None:
    """Log structured data as formatted JSON."""
    await _log(f"{label}: {json.dumps(data)}")


async def _ensure_cookies(context: BrowserContext) -> None:
    """Load saved cookies into browser context, or run interactive login."""
    cookies_path = Path(settings.linkedin_cookies_path)

    if cookies_path.exists():
        await _log("Loading saved LinkedIn cookies...")
        with open(cookies_path, "r") as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)
        await _log("Cookies loaded successfully.")
    else:
        await _log("No LinkedIn cookies found. Starting interactive login...")
        await _interactive_login(context, cookies_path)


async def _interactive_login(context: BrowserContext, cookies_path: Path) -> None:
    """Open a headed browser for manual LinkedIn login and save cookies."""
    page = await context.new_page()
    await page.goto("https://www.linkedin.com/login")

    print("\n" + "=" * 60)
    print("Please log into LinkedIn in the browser window.")
    print("Press Enter here when you're done logging in.")
    print("=" * 60 + "\n")

    await asyncio.get_event_loop().run_in_executor(None, input)

    cookies = await context.cookies()
    cookies_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cookies_path, "w") as f:
        json.dump(cookies, f, indent=2)

    await page.close()
    await _log(f"Cookies saved to {cookies_path}")


def _is_authwall(title: str, url: str) -> bool:
    """Detect if LinkedIn has blocked us with an auth wall."""
    title_lower = title.lower()
    return "authwall" in title_lower or ("auth" in url and "wall" in url)


import shutil

async def scrape_linkedin(
    date_filter: str = "r604800",
    source_type: str = "emails",
    limit: int = 5,
    location: Optional[str] = None,
) -> int:
    """
    Scrape LinkedIn jobs based on configured keywords and location.
    Returns the number of new jobs found.
    """
    # shutil.rmtree("storage/request_queues/default", ignore_errors=True)
    
    keywords = quote_plus(settings.linkedin_search_keywords)
    location_param = f"&location={quote_plus(location)}" if location else ""
    start_url = f"https://www.linkedin.com/jobs/search/?keywords={keywords}&f_TPR={date_filter}&f_WT=2{location_param}"

    await _log(f"=== Starting LinkedIn scrape ===")
    await _log(f"Search keywords: {settings.linkedin_search_keywords}")
    await _log(f"Date filter: {date_filter}")
    await _log(f"Location: {location or 'Not specified'}")
    await _log(f"Source type: {source_type}")
    await _log(f"Target URL: {start_url}")

    new_jobs_count = 0

    requests_limit = limit + 10 if source_type == "emails" else 2

    crawler = PlaywrightCrawler(
        max_requests_per_crawl=requests_limit,
        headless=True,
        browser_type="chromium",
    )

    @crawler.router.default_handler
    async def listing_handler(context: PlaywrightCrawlingContext) -> None:
        nonlocal new_jobs_count
        page = context.page

        title = await page.title()
        await _log(f"Page title: {title}")

        if _is_authwall(title, page.url):
            cookies_path = Path(settings.linkedin_cookies_path)
            if cookies_path.exists():
                os.remove(cookies_path)
            await _log("Auth wall detected! Cookies cleared. Please re-authenticate.")
            raise RuntimeError(
                "LinkedIn auth wall detected. Run 'python cli.py auth-linkedin' to re-login."
            )

        await _log(f"Scraping listing page: {page.url}")

        job_links = await page.query_selector_all("ul.jobs-search__results-list a")
        urls = []
        for link in job_links:
            href = await link.get_attribute("href")
            if href and "/jobs/view/" in href:
                full_url = (
                    href
                    if href.startswith("http")
                    else f"https://www.linkedin.com{href}"
                )
                full_url = full_url.split("?")[0]
                urls.append(full_url)

        await _log(f"Found {len(urls)} job listing links")

        if len(urls) == 0:
            await _log("WARNING: No job links found on listing page!")
            return

        # For manual mode, save all links directly without crawling detail pages
        if source_type == "manual":
            await _log(f"[MANUAL] Saving up to {limit} new jobs directly from listing (found {len(urls)} links)...")
            for i, url in enumerate(urls):
                if new_jobs_count >= limit:
                    break
                job = await save_job_if_new(
                    title=f"Job #{i + 1}",
                    company=None,
                    recruiter_name=None,
                    email=f"manual-{url}",
                    source_site="linkedin",
                    source_url=url,
                    raw_post_text=f"Link: {url}",
                    source_type=source_type,
                )
                if job:
                    new_jobs_count += 1
                    if (i + 1) % 10 == 0:
                        await _log(f"[MANUAL] Saved {i + 1}/{len(urls)} jobs...")
            await _log(f"[MANUAL] Done! Saved {new_jobs_count} jobs total")
            return

        # For emails mode, crawl each detail page
        queued_count = 0
        for i, url in enumerate(urls):
            if queued_count >= limit:
                break
            await _log(f"Queueing job {i + 1}/{len(urls)}: {url}")
            await context.add_requests([url])
            queued_count += 1

    @crawler.router.handler("job_detail")
    async def detail_handler(context: PlaywrightCrawlingContext) -> None:
        nonlocal new_jobs_count
        if new_jobs_count >= limit:
            return  # Early exit if we reached the limit

        page = context.page

        title = await page.title()
        if _is_authwall(title, page.url):
            await _log(f"Auth wall on detail page, skipping: {page.url}")
            return

        await _log(f"--- Scraping job detail: {page.url}")

        title_el = await page.query_selector("h1.top-card-layout__title")
        job_title = await title_el.inner_text() if title_el else "Unknown Title"
        job_title = job_title.strip() if job_title else job_title

        company_el = await page.query_selector("a.topcard__org-name-link")
        company = await company_el.inner_text() if company_el else None
        if company:
            company = company.strip()

        await _log(f"Job title: {job_title}")
        await _log(f"Company: {company}")

        desc_el = await page.query_selector("div.description__text")
        description = await desc_el.inner_text() if desc_el else ""
        description = description.strip() if description else description

        await _log(
            f"Description length: {len(description) if description else 0} chars"
        )

        recruiter_el = await page.query_selector(".message-the-recruiter h3")
        recruiter_name = await recruiter_el.inner_text() if recruiter_el else None
        if recruiter_name:
            recruiter_name = recruiter_name.strip()
            await _log(f"Recruiter name: {recruiter_name}")

        full_text = await page.inner_text("body")

        # For manual mode, save job without requiring email
        if source_type == "manual":
            await _log(f"[MANUAL] Saving job: {job_title} @ {company}")
            clean_url = page.url.split("?")[0]
            job = await save_job_if_new(
                title=job_title.strip(),
                company=company,
                recruiter_name=recruiter_name,
                email=f"manual-{clean_url}",
                source_site="linkedin",
                source_url=clean_url,
                raw_post_text=description.strip() if description else "",
                source_type=source_type,
            )
            if job:
                new_jobs_count += 1
                await _log(f"✓ Manual job saved: ID={job.id}, {job_title} @ {company}")
            await asyncio.sleep(random.uniform(1, 3))
            return

        emails = extract_emails(full_text)

        await _log(f"Emails found: {emails}")

        if not emails:
            await _log(f"WARNING: No emails found for job '{job_title}' at {company}")
            await _log(
                f"Full page text length: {len(full_text) if full_text else 0} chars"
            )

            if description:
                desc_preview = description[:300]
                await _log(f"Description preview: {desc_preview}...")
            return

        await _log(f"Found {len(emails)} email(s) for {job_title}")

        for email in emails:
            await _log(f"Processing email: {email}")

            job = await save_job_if_new(
                title=job_title.strip(),
                company=company,
                recruiter_name=recruiter_name,
                email=email,
                source_site="linkedin",
                source_url=page.url,
                raw_post_text=description.strip() if description else "",
                source_type=source_type,
            )

            if job:
                new_jobs_count += 1
                await _log(
                    f"✓ New job saved: ID={job.id}, {job_title} @ {company} ({email})"
                )

                try:
                    draft_data = await generate_email_draft(job)
                    draft = EmailDraft(
                        job_id=str(job.id),
                        subject=draft_data["subject"],
                        body=draft_data["body"],
                    )
                    await draft.insert()
                    job.status = "drafted"
                    await job.save()
                    await _log(f"✓ Draft generated for: {job_title}")
                except Exception as e:
                    await _log(f"ERROR: Failed to generate draft for {job_title}: {e}")
            else:
                await _log(f"Job already exists (duplicate): {job_title} @ {company}")

        await asyncio.sleep(random.uniform(3, 8))

    await _log("Starting LinkedIn crawler...")
    # Use a unique request queue for each run to avoid conflicts and cache issues
    queue_name = f"linkedin-{uuid.uuid4().hex[:8]}"
    queue = await RequestQueue.open(name=queue_name)
    await crawler.run([start_url], request_queue=queue)
    
    # Clean up the queue after run
    await queue.drop()

    if new_jobs_count == 0:
        await _log("WARNING: No new jobs were scraped!")
        await _log("Possible reasons:")
        await _log("  - No job listings matched your search criteria")
        await _log("  - Jobs found but no contact emails displayed")
        await _log("  - All found jobs are duplicates of existing entries")
    else:
        await _log(
            f"=== LinkedIn scrape complete. New jobs found: {new_jobs_count} ==="
        )

    return new_jobs_count


async def delete_cookies_and_reauth() -> None:
    """Delete saved cookies to force re-authentication."""
    cookies_path = Path(settings.linkedin_cookies_path)
    if cookies_path.exists():
        os.remove(cookies_path)
        logger.info("LinkedIn cookies deleted.")

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        await _interactive_login(context, cookies_path)
        await browser.close()
