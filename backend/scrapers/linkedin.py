"""
LinkedIn job scraper using Crawlee's PlaywrightCrawler.
Handles cookie-based session authentication and job detail extraction.
"""

import asyncio
import json
import logging
import os
import random
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext
from playwright.async_api import BrowserContext

from backend.ai.email_writer import generate_email_draft
from backend.config import settings
from backend.db.models import EmailDraft
from backend.scrapers.base import extract_emails, save_job_if_new

logger = logging.getLogger(__name__)

# Module-level reference for WebSocket broadcast
_ws_broadcast: Optional[callable] = None


def set_ws_broadcast(fn: callable) -> None:
    """Set the WebSocket broadcast function for live logging."""
    global _ws_broadcast
    _ws_broadcast = fn


async def _log(message: str) -> None:
    """Log a message and broadcast via WebSocket if available."""
    logger.info(message)
    if _ws_broadcast:
        await _ws_broadcast(f"[LinkedIn] {message}")


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

    # Wait for user input (blocking — only used in CLI mode)
    await asyncio.get_event_loop().run_in_executor(None, input)

    # Save cookies
    cookies = await context.cookies()
    cookies_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cookies_path, "w") as f:
        json.dump(cookies, f, indent=2)

    await page.close()
    await _log(f"Cookies saved to {cookies_path}")


def _is_authwall(title: str, url: str) -> bool:
    """Detect if LinkedIn has blocked us with an auth wall."""
    title_lower = title.lower()
    return "authwall" in title_lower or "auth" in url and "wall" in url


async def scrape_linkedin() -> int:
    """
    Scrape LinkedIn jobs based on configured keywords and location.
    Returns the number of new jobs found.
    """
    keywords = quote_plus(settings.linkedin_search_keywords)
    location = quote_plus(settings.linkedin_search_location)
    start_url = (
        f"https://www.linkedin.com/jobs/search/"
        f"?keywords={keywords}&location={location}"
    )

    new_jobs_count = 0

    crawler = PlaywrightCrawler(
        max_requests_per_crawl=50,
        headless=True,
        browser_type="chromium",
    )

    @crawler.router.default_handler
    async def listing_handler(context: PlaywrightCrawlingContext) -> None:
        nonlocal new_jobs_count
        page = context.page

        # Check for auth wall
        title = await page.title()
        if _is_authwall(title, page.url):
            cookies_path = Path(settings.linkedin_cookies_path)
            if cookies_path.exists():
                os.remove(cookies_path)
            await _log("Auth wall detected! Cookies cleared. Please re-authenticate.")
            raise RuntimeError(
                "LinkedIn auth wall detected. Run 'python cli.py auth-linkedin' to re-login."
            )

        await _log(f"Scraping listing page: {page.url}")

        # Extract job links
        job_links = await page.query_selector_all("ul.jobs-search__results-list a")
        urls = []
        for link in job_links:
            href = await link.get_attribute("href")
            if href and "/jobs/view/" in href:
                full_url = href if href.startswith("http") else f"https://www.linkedin.com{href}"
                urls.append(full_url)

        await _log(f"Found {len(urls)} job links on listing page")

        for url in urls:
            await context.add_requests(
                [{"url": url, "label": "job_detail"}]
            )

    @crawler.router.handler("job_detail")
    async def detail_handler(context: PlaywrightCrawlingContext) -> None:
        nonlocal new_jobs_count
        page = context.page

        # Check for auth wall
        title = await page.title()
        if _is_authwall(title, page.url):
            await _log("Auth wall on detail page, skipping...")
            return

        await _log(f"Scraping job detail: {page.url}")

        # Extract job details
        title_el = await page.query_selector("h1.top-card-layout__title")
        job_title = await title_el.inner_text() if title_el else "Unknown Title"

        company_el = await page.query_selector("a.topcard__org-name-link")
        company = await company_el.inner_text() if company_el else None
        if company:
            company = company.strip()

        desc_el = await page.query_selector("div.description__text")
        description = await desc_el.inner_text() if desc_el else ""

        # Try to find recruiter name
        recruiter_el = await page.query_selector(".message-the-recruiter h3")
        recruiter_name = await recruiter_el.inner_text() if recruiter_el else None

        # Extract emails from entire page text
        full_text = await page.inner_text("body")
        emails = extract_emails(full_text)

        if not emails:
            await _log(f"No emails found for: {job_title}")
            return

        # Save each unique email as a job
        for email in emails:
            job = await save_job_if_new(
                title=job_title.strip(),
                company=company,
                recruiter_name=recruiter_name,
                email=email,
                source_site="linkedin",
                source_url=page.url,
                raw_post_text=description.strip(),
            )

            if job:
                new_jobs_count += 1
                await _log(f"New job saved: {job_title} ({email})")

                # Generate email draft
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
                    await _log(f"Draft generated for: {job_title}")
                except Exception as e:
                    await _log(f"Failed to generate draft for {job_title}: {e}")

        # Random delay between detail pages
        await asyncio.sleep(random.uniform(3, 8))

    # Removed duplicate default_handler for pre_navigation

    # Run the crawler
    await _log("Starting LinkedIn scrape...")
    await crawler.run([start_url])
    await _log(f"LinkedIn scrape complete. New jobs found: {new_jobs_count}")

    return new_jobs_count


async def delete_cookies_and_reauth() -> None:
    """Delete saved cookies to force re-authentication."""
    cookies_path = Path(settings.linkedin_cookies_path)
    if cookies_path.exists():
        os.remove(cookies_path)
        logger.info("LinkedIn cookies deleted.")

    # Launch headed browser for login
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        await _interactive_login(context, cookies_path)
        await browser.close()
