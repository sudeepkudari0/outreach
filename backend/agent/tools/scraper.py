"""
LinkedIn single-job-page scraper using Crawlee's PlaywrightCrawler.

Given a LinkedIn job URL (e.g. linkedin.com/jobs/view/12345), extracts:
- Job title
- Company name
- Recruiter / poster name (if visible)
- Company domain
- Job description

Uses the same cookie-based auth as the existing bulk scraper.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext

from backend.config import settings

logger = logging.getLogger(__name__)


@dataclass
class JobDetails:
    """Structured result from scraping a single LinkedIn job page."""

    job_title: str = ""
    company: str = ""
    recruiter_name: str = ""
    company_domain: str = ""
    location: str = ""
    job_description: str = ""
    source_url: str = ""
    errors: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return bool(self.job_title and self.company)


def _validate_linkedin_url(url: str) -> str:
    """Validate and normalize a LinkedIn job URL. Returns the cleaned URL."""
    parsed = urlparse(url)

    if "linkedin.com" not in parsed.netloc:
        raise ValueError(f"Not a LinkedIn URL: {url}")

    # The path is usually /jobs/view/SLUG-ID, /jobs/view/ID, or /jobs/ID
    match = re.search(r"/jobs/(?:view/)?(?:[\w-]+-)?(\d+)", parsed.path)
    if not match:
        raise ValueError(f"Not a LinkedIn job URL: {url}")

    job_id = match.group(1)
    # Always normalize to canonical URL format, removing query params
    return f"https://www.linkedin.com/jobs/view/{job_id}"


def _is_authwall(title: str, url: str) -> bool:
    """Detect if LinkedIn has blocked us with an auth wall."""
    title_lower = title.lower()
    return "authwall" in title_lower or ("auth" in url and "wall" in url)


def _guess_domain_from_company(company_name: str) -> str:
    """Best-effort guess of a company domain from its name."""
    if not company_name:
        return ""
    cleaned = company_name.lower().strip()
    for suffix in [" inc", " inc.", " llc", " ltd", " ltd.", " corp", " corp.",
                   " co.", " co", " pvt", " pvt.", " private", " limited",
                   " technologies", " tech", " software", " solutions",
                   " services", " group", " labs", " studio", " studios"]:
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()
    cleaned = re.sub(r"[^a-z0-9]", "", cleaned)
    if cleaned:
        return f"{cleaned}.com"
    return ""


async def _load_cookies(context) -> None:
    """Load saved LinkedIn cookies into browser context (same as existing scraper)."""
    cookies_path = Path(settings.linkedin_cookies_path)
    if cookies_path.exists():
        logger.info("Loading saved LinkedIn cookies...")
        with open(cookies_path, "r") as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)
        logger.info("Cookies loaded successfully.")
    else:
        logger.warning(
            "No LinkedIn cookies found. Run 'python cli.py auth-linkedin' first."
        )


async def scrape_job_page(url: str) -> JobDetails:
    """
    Scrape a single LinkedIn job page using Crawlee PlaywrightCrawler.

    Uses saved LinkedIn cookies for authentication, same as the bulk scraper.
    """
    url = _validate_linkedin_url(url)
    logger.info(f"Scraping job page: {url}")

    # Will be populated by the handler
    result = JobDetails(source_url=url)

    crawler = PlaywrightCrawler(
        max_requests_per_crawl=1,
        headless=True,
        browser_type="chromium",
    )

    @crawler.router.default_handler
    async def job_page_handler(context: PlaywrightCrawlingContext) -> None:
        page = context.page

        # Check for auth wall
        title = await page.title()
        if _is_authwall(title, page.url):
            result.errors.append("LinkedIn auth wall detected. Re-authenticate with 'python cli.py auth-linkedin'.")
            logger.error("Auth wall detected on job page")
            return

        logger.info(f"Page loaded: {page.url} — title: {title}")

        # ── Job Title ──
        title_el = (
            await page.query_selector("h1.top-card-layout__title")
            or await page.query_selector("h2.top-card-layout__title")
            or await page.query_selector("h1.topcard__title")
            or await page.query_selector("h1.t-24")
            or await page.query_selector("h1")
        )
        if title_el:
            result.job_title = (await title_el.inner_text()).strip()
            logger.info(f"Job title: {result.job_title}")

        # ── Company Name ──
        company_el = (
            await page.query_selector("a.topcard__org-name-link")
            or await page.query_selector("a.top-card-layout__company-url")
            or await page.query_selector("span.topcard__flavor--black-link")
            or await page.query_selector("a[data-tracking-control-name='public_jobs_topcard-org-name']")
            or await page.query_selector(".top-card-layout__second-subline a")
        )
        if company_el:
            result.company = (await company_el.inner_text()).strip()
            logger.info(f"Company: {result.company}")

            # Try to extract company domain from href
            href = await company_el.get_attribute("href")
            if href and "linkedin.com/company/" not in href and href.startswith("http"):
                try:
                    result.company_domain = urlparse(href).netloc
                except Exception:
                    pass

        # ── Location ──
        location_el = (
            await page.query_selector("span.topcard__flavor--bullet")
            or await page.query_selector(".top-card-layout__second-subline span")
        )
        if location_el:
            result.location = (await location_el.inner_text()).strip()

        # ── Job Description ──
        desc_el = (
            await page.query_selector("div.show-more-less-html__markup")
            or await page.query_selector("div.description__text")
            or await page.query_selector("section.description")
        )
        if desc_el:
            result.job_description = (await desc_el.inner_text()).strip()
            logger.info(f"Description length: {len(result.job_description)} chars")

        # ── Recruiter / Poster Name ──
        recruiter_el = (
            await page.query_selector(".message-the-recruiter h3")
            or await page.query_selector(".hirer-card__hirer-information h3")
            or await page.query_selector("a.message-the-recruiter__cta")
            or await page.query_selector(".jobs-poster__name")
        )
        if recruiter_el:
            result.recruiter_name = (await recruiter_el.inner_text()).strip()
            logger.info(f"Recruiter: {result.recruiter_name}")

        # ── Company Domain (fallback: website link) ──
        if not result.company_domain:
            website_el = await page.query_selector(
                "a[data-tracking-control-name='public_jobs_topcard_org-website']"
            )
            if website_el:
                href = await website_el.get_attribute("href")
                if href:
                    try:
                        result.company_domain = urlparse(href).netloc
                    except Exception:
                        pass

    # Run the crawler
    try:
        await crawler.run([url])
    except Exception as e:
        logger.error(f"Crawler error: {e}")
        result.errors.append(f"Crawler error: {str(e)}")

    # Post-process: guess domain if still missing
    if not result.company_domain and result.company:
        result.company_domain = _guess_domain_from_company(result.company)
        if result.company_domain:
            logger.info(f"Guessed company domain: {result.company_domain}")

    if result.is_valid:
        logger.info(
            f"Scrape complete: {result.job_title} at {result.company} "
            f"(recruiter: {result.recruiter_name or 'N/A'}, domain: {result.company_domain or 'N/A'})"
        )
    else:
        logger.warning(f"Scrape incomplete — errors: {result.errors}")

    return result
