"""
Naukri job scraper using Crawlee's BeautifulSoupCrawler.
No login required — scrapes public job listings.
"""

import asyncio
import logging
import random
from typing import Optional

from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext

from backend.ai.email_writer import generate_email_draft
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
        await _ws_broadcast(f"[Naukri] {message}")


async def scrape_naukri() -> int:
    """
    Scrape Naukri jobs for full-stack developer positions in Bangalore.
    Returns the number of new jobs found.
    """
    start_url = "https://www.naukri.com/full-stack-developer-jobs-in-bangalore"
    new_jobs_count = 0

    crawler = BeautifulSoupCrawler(
        max_requests_per_crawl=50,
    )

    @crawler.router.default_handler
    async def listing_handler(context: BeautifulSoupCrawlingContext) -> None:
        nonlocal new_jobs_count
        soup = context.soup

        await _log(f"Scraping listing page: {context.request.url}")

        # Extract job card links
        job_cards = soup.select("article.jobTuple a.title, a.job-title-href, a[class*='title']")

        # Fallback: try other common selectors
        if not job_cards:
            job_cards = soup.select("a[href*='/job-listings-']")

        urls = []
        for card in job_cards:
            href = card.get("href", "")
            if href and href.startswith("http"):
                urls.append(href)
            elif href.startswith("/"):
                urls.append(f"https://www.naukri.com{href}")

        await _log(f"Found {len(urls)} job links on listing page")

        for url in urls:
            await context.add_requests(
                [{"url": url, "label": "job_detail"}]
            )

    @crawler.router.handler("job_detail")
    async def detail_handler(context: BeautifulSoupCrawlingContext) -> None:
        nonlocal new_jobs_count
        soup = context.soup

        await _log(f"Scraping job detail: {context.request.url}")

        # Extract job title
        title_el = soup.select_one("h1.jd-header-title, h1[class*='title']")
        job_title = title_el.get_text(strip=True) if title_el else "Unknown Title"

        # Extract company
        company_el = soup.select_one(
            "a.jd-header-comp-name, div[class*='company-name'], a[class*='comp-name']"
        )
        company = company_el.get_text(strip=True) if company_el else None

        # Extract full description text
        desc_el = soup.select_one(
            "div.job-desc, section.job-desc, div[class*='description'], div[class*='jd-desc']"
        )
        description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

        # Extract emails from entire page text
        full_text = soup.get_text(separator=" ")
        emails = extract_emails(full_text)

        if not emails:
            await _log(f"No emails found for: {job_title}")
            return

        # Save each unique email as a job
        for email in emails:
            job = await save_job_if_new(
                title=job_title,
                company=company,
                recruiter_name=None,
                email=email,
                source_site="naukri",
                source_url=context.request.url,
                raw_post_text=description,
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

        # Random delay between pages
        await asyncio.sleep(random.uniform(2, 5))

    # Run the crawler
    await _log("Starting Naukri scrape...")
    await crawler.run([start_url])
    await _log(f"Naukri scrape complete. New jobs found: {new_jobs_count}")

    return new_jobs_count
