"""
Typer CLI for the Job Outreach Automation system.

Commands:
  auth-gmail       — Run Gmail OAuth2 flow
  auth-linkedin    — Re-authenticate LinkedIn
  scrape           — Run scraper immediately
  review           — Interactive review of drafted emails
  send-approved    — Send all approved emails
  stats            — Print analytics summary
"""

import asyncio
import sys
from pathlib import Path
from typing import Optional

# Ensure the project root (parent of backend/) is on sys.path
# so that `from backend.xxx` imports work when running `python cli.py` directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import typer

app = typer.Typer(
    name="job-outreach",
    help="Job Outreach Automation CLI",
    add_completion=False,
)


def _run_async(coro):
    """Helper to run async functions from sync CLI context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _init_db():
    """Initialize the database for CLI commands."""
    from backend.db import init_db
    await init_db()


@app.command()
def auth_gmail():
    """Run Gmail OAuth2 authorization flow."""
    from backend.mailer.auth import run_gmail_oauth_flow
    run_gmail_oauth_flow()


@app.command()
def auth_linkedin():
    """Delete cookies and re-authenticate LinkedIn."""
    from backend.scrapers.linkedin import delete_cookies_and_reauth

    typer.echo("🔐 Starting LinkedIn re-authentication...")
    _run_async(delete_cookies_and_reauth())
    typer.echo("✅ LinkedIn authentication complete.")


@app.command()
def scrape(
    site: str = typer.Option("all", help="Site to scrape: linkedin, naukri, or all"),
):
    """Run job scraper immediately."""

    async def _scrape():
        await _init_db()

        if site in ("linkedin", "all"):
            typer.echo("🔍 Scraping LinkedIn...")
            from backend.scrapers.linkedin import scrape_linkedin
            count = await scrape_linkedin()
            typer.echo(f"   Found {count} new jobs from LinkedIn")

        if site in ("naukri", "all"):
            typer.echo("🔍 Scraping Naukri...")
            from backend.scrapers.naukri import scrape_naukri
            count = await scrape_naukri()
            typer.echo(f"   Found {count} new jobs from Naukri")

        typer.echo("✅ Scrape complete.")

    _run_async(_scrape())


@app.command()
def review():
    """Interactive review of drafted email drafts."""

    async def _review():
        await _init_db()
        from backend.db.models import Job, EmailDraft

        jobs = await Job.find(Job.status == "drafted").to_list()

        if not jobs:
            typer.echo("No drafted emails to review.")
            return

        typer.echo(f"\n📧 {len(jobs)} drafted emails to review:\n")

        for i, job in enumerate(jobs, 1):
            draft = await EmailDraft.find_one(EmailDraft.job_id == str(job.id))
            if not draft:
                continue

            typer.echo("=" * 60)
            typer.echo(f"  [{i}/{len(jobs)}] {job.title}")
            typer.echo(f"  Company: {job.company or 'N/A'}")
            typer.echo(f"  Email: {job.email}")
            typer.echo(f"  Source: {job.source_site}")
            typer.echo("-" * 60)
            typer.echo(f"  Subject: {draft.subject}")
            typer.echo(f"\n{draft.body}\n")
            typer.echo("=" * 60)

            while True:
                choice = typer.prompt(
                    "  [A]pprove / [E]dit / [S]kip / [I]gnore",
                    default="S",
                ).upper()

                if choice == "A":
                    job.status = "approved"
                    await job.save()
                    typer.echo("  ✅ Approved")
                    break
                elif choice == "E":
                    new_subject = typer.prompt("  New subject", default=draft.subject)
                    new_body = typer.prompt("  New body (paste, then Enter)", default=draft.body)
                    draft.subject = new_subject
                    draft.body = new_body
                    draft.edited = True
                    await draft.save()
                    job.status = "approved"
                    await job.save()
                    typer.echo("  ✅ Edited and approved")
                    break
                elif choice == "S":
                    typer.echo("  ⏭️  Skipped")
                    break
                elif choice == "I":
                    job.status = "ignored"
                    await job.save()
                    typer.echo("  🚫 Ignored")
                    break
                else:
                    typer.echo("  Invalid choice. Try A/E/S/I.")

        typer.echo("\n✅ Review complete.")

    _run_async(_review())


@app.command()
def send_approved():
    """Send all approved emails via Gmail."""

    async def _send():
        await _init_db()
        from backend.db.models import Job, EmailDraft
        from backend.mailer.sender import send_email
        from backend.config import settings

        approved = await Job.find(Job.status == "approved").to_list()

        if not approved:
            typer.echo("No approved emails to send.")
            return

        typer.echo(f"\n📤 Sending {len(approved)} approved emails...\n")

        sent = 0
        for job in approved:
            if sent >= settings.daily_send_limit:
                typer.echo(f"⚠️  Daily limit reached ({settings.daily_send_limit})")
                break

            draft = await EmailDraft.find_one(EmailDraft.job_id == str(job.id))
            if not draft or not draft.subject or not draft.body:
                typer.echo(f"  ⏭️  Skipping {job.email} — no draft")
                continue

            try:
                from datetime import datetime, timezone

                msg_id = await send_email(job.email, draft.subject, draft.body)
                draft.sent_at = datetime.now(timezone.utc)
                await draft.save()
                job.status = "sent"
                await job.save()
                sent += 1
                typer.echo(f"  ✅ Sent to {job.email} (ID: {msg_id})")

                # Delay between sends
                if sent < len(approved):
                    typer.echo("  ⏳ Waiting 30 seconds...")
                    await asyncio.sleep(30)

            except Exception as e:
                typer.echo(f"  ❌ Failed {job.email}: {e}")

        typer.echo(f"\n✅ Done. Sent {sent} emails.")

    _run_async(_send())


@app.command()
def stats():
    """Print analytics summary to terminal."""

    async def _stats():
        await _init_db()
        from backend.db.models import Job, EmailDraft
        from backend.config import settings
        from datetime import datetime, timezone

        total = await Job.find().count()
        drafted = await Job.find(Job.status == "drafted").count()
        approved = await Job.find(Job.status == "approved").count()
        sent = await Job.find(Job.status == "sent").count()
        replied = await Job.find(Job.status == "replied").count()
        ignored = await Job.find(Job.status == "ignored").count()

        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        sent_today = await EmailDraft.find(
            EmailDraft.sent_at >= today_start,
            EmailDraft.sent_at != None,
        ).count()

        reply_rate = (replied / sent * 100) if sent > 0 else 0

        typer.echo("\n📊 Job Outreach Statistics")
        typer.echo("=" * 40)
        typer.echo(f"  Total Jobs Found:    {total}")
        typer.echo(f"  Drafted:             {drafted}")
        typer.echo(f"  Approved:            {approved}")
        typer.echo(f"  Sent:                {sent}")
        typer.echo(f"  Replied:             {replied}")
        typer.echo(f"  Ignored:             {ignored}")
        typer.echo("-" * 40)
        typer.echo(f"  Reply Rate:          {reply_rate:.1f}%")
        typer.echo(f"  Sent Today:          {sent_today}")
        typer.echo(f"  Daily Limit:         {settings.daily_send_limit}")
        typer.echo("=" * 40)

        # Per-site breakdown
        for site in ["linkedin", "naukri"]:
            site_total = await Job.find(Job.source_site == site).count()
            site_sent = await Job.find(
                Job.source_site == site, Job.status == "sent"
            ).count()
            if site_total > 0:
                typer.echo(f"  {site.capitalize():12s}  found={site_total}  sent={site_sent}")

        typer.echo("")

    _run_async(_stats())


if __name__ == "__main__":
    app()
