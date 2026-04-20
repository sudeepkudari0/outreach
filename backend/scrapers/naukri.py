"""
Naukri job scraper using Crawlee's BeautifulSoupCrawler.
No login required — scrapes public job listings.
"""

import asyncio
import json
import logging
import random
from typing import Optional

from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext

from backend.ai.email_writer import generate_email_draft
from backend.db.models import EmailDraft
from backend.scrapers.base import extract_emails, save_job_if_new

logger = logging.getLogger(__name__)

_ws_broadcast: Optional[callable] = None


def set_ws_broadcast(fn: callable) -> None:
    global _ws_broadcast
    _ws_broadcast = fn


async def _log(message: str) -> None:
    logger.info(message)
    if _ws_broadcast:
        await _ws_broadcast(f"[Naukri] {message}")


async def scrape_naukri(
    date_filter: str = "r604800",
    source_type: str = "emails",
) -> int:
    start_url = "https://www.naukri.com/full-stack-developer-jobs-in-bangalore"

    await _log(f"=== Starting Naukri scrape ===")
    await _log(f"Search: full-stack developer in Bangalore")
    await _log(f"Date filter: {date_filter}")
    await _log(f"Source type: {source_type}")
    await _log(f"Target URL: {start_url}")

    new_jobs_count = 0

    crawler = BeautifulSoupCrawler(
        max_requests_per_crawl=50,
    )

    @crawler.router.default_handler
    async def listing_handler(context: BeautifulSoupCrawlingContext) -> None:
        nonlocal new_jobs_count
        soup = context.soup

        await _log(f"Scraping listing page: {context.request.url}")

        job_cards = soup.select(
            "article.jobTuple a.title, a.job-title-href, a[class*='title']"
        )

        if not job_cards:
            job_cards = soup.select("a[href*='/job-listings-']")

        urls = []
        for card in job_cards:
            href = card.get("href", "")
            if href and href.startswith("http"):
                urls.append(href)
            elif href.startswith("/"):
                urls.append(f"https://www.naukri.com{href}")

        await _log(f"Found {len(urls)} job listing links")

        if len(urls) == 0:
            await _log("WARNING: No job links found on listing page!")
            return

        # For manual mode, save all links directly without crawling detail pages
        if source_type == "manual":
            await _log(f"[MANUAL] Saving {len(urls)} jobs directly from listing...")
            for i, url in enumerate(urls):
                job = await save_job_if_new(
                    title=f"Job #{i + 1}",
                    company=None,
                    recruiter_name=None,
                    email=f"manual-{url}",
                    source_site="naukri",
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
        for i, url in enumerate(urls):
            await _log(f"Queueing job {i + 1}/{len(urls)}: {url}")
            await context.add_requests([url])

    @crawler.router.handler("job_detail")
    async def detail_handler(context: BeautifulSoupCrawlingContext) -> None:
        nonlocal new_jobs_count
        soup = context.soup

        await _log(f"--- Scraping job detail: {context.request.url}")

        title_el = soup.select_one("h1.jd-header-title, h1[class*='title']")
        job_title = title_el.get_text(strip=True) if title_el else "Unknown Title"

        company_el = soup.select_one(
            "a.jd-header-comp-name, div[class*='company-name'], a[class*='comp-name']"
        )
        company = company_el.get_text(strip=True) if company_el else None

        await _log(f"Job title: {job_title}")
        await _log(f"Company: {company}")

        desc_el = soup.select_one(
            "div.job-desc, section.job-desc, div[class*='description'], div[class*='jd-desc']"
        )
        description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

        await _log(
            f"Description length: {len(description) if description else 0} chars"
        )

        full_text = soup.get_text(separator=" ")

        # For manual mode, save job without requiring email
        if source_type == "manual":
            await _log(f"[MANUAL] Saving job: {job_title} @ {company}")
            job = await save_job_if_new(
                title=job_title,
                company=company,
                recruiter_name=None,
                email=f"manual-{context.request.url}",
                source_site="naukri",
                source_url=context.request.url,
                raw_post_text=description,
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
                title=job_title,
                company=company,
                recruiter_name=None,
                email=email,
                source_site="naukri",
                source_url=context.request.url,
                raw_post_text=description,
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

        await asyncio.sleep(random.uniform(2, 5))

    await _log("Starting Naukri crawler...")
    await crawler.run([start_url])

    if new_jobs_count == 0:
        await _log("WARNING: No new jobs were scraped!")
        await _log("Possible reasons:")
        await _log("  - No job listings available for the search criteria")
        await _log("  - Jobs found but no contact emails displayed")
        await _log("  - All found jobs are duplicates of existing entries")
    else:
        await _log(f"=== Naukri scrape complete. New jobs found: {new_jobs_count} ===")

    return new_jobs_count
