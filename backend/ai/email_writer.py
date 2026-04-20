"""
AI email writer — provider switcher for Claude, Grok, and Ollama.

Single entry point: generate_email_draft(job) → {"subject": "...", "body": "..."}
"""

import json
import logging
from typing import Any

import anthropic
import httpx
import openai

from backend.config import settings
from backend.db.models import Job

logger = logging.getLogger(__name__)


def _build_system_prompt() -> str:
    """Build the shared system prompt from user profile settings."""
    return f"""You are a professional email writer helping a job seeker send cold outreach emails to recruiters.

About the sender:
- Name: {settings.my_name}
- Role: {settings.my_role}
- Skills: {settings.my_skills}
- Years of experience: {settings.my_experience_years}
- LinkedIn: {settings.my_linkedin_url}
- GitHub: {settings.my_github_url}
- Portfolio: {settings.my_portfolio_url}

Rules for writing the email:
1. Write a short, genuine, human-sounding cold email — NOT a cover letter.
2. Maximum 150 words in the body.
3. Do NOT open with "I am writing to express my interest" or any generic opener.
4. Mention one specific thing from the job post to show this is personalized, not a template.
5. End with a simple call to action (e.g., "Would love to chat if you think there's a fit.").
6. Return ONLY valid JSON with keys "subject" and "body" — no markdown, no explanation, no code fences.
7. The body must be plain text only (no HTML tags).
8. Keep the tone conversational and confident, not desperate or overly formal."""


def _build_user_prompt(job: Job) -> str:
    """Build the user prompt from job details."""
    recruiter_info = ""
    if job.recruiter_name:
        recruiter_info = f"\nRecruiter name: {job.recruiter_name}"
    company_info = ""
    if job.company:
        company_info = f"\nCompany: {job.company}"

    return f"""Write a cold outreach email for this job posting.

Job title: {job.title}{company_info}{recruiter_info}
Recruiter email: {job.email}

Full job post text:
---
{job.raw_post_text}
---

Return ONLY a JSON object with "subject" and "body" keys. No other text."""


def _parse_json_response(text: str) -> dict[str, str]:
    """Parse JSON from an AI response, handling common formatting issues."""
    cleaned = text.strip()

    # Remove markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first and last lines (code fences)
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    result = json.loads(cleaned)

    if "subject" not in result or "body" not in result:
        raise ValueError("Response JSON missing 'subject' or 'body' keys")

    return {"subject": str(result["subject"]), "body": str(result["body"])}


async def _generate_with_claude(system_prompt: str, user_prompt: str) -> dict[str, str]:
    """Generate email draft using Claude via Anthropic SDK."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = response.content[0].text
    return _parse_json_response(text)


async def _generate_with_grok(system_prompt: str, user_prompt: str) -> dict[str, str]:
    """Generate email draft using Grok (OpenAI-compatible API)."""
    client = openai.AsyncOpenAI(
        api_key=settings.grok_api_key,
        base_url=settings.grok_base_url,
    )

    response = await client.chat.completions.create(
        model=settings.grok_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=1024,
    )

    text = response.choices[0].message.content or ""
    return _parse_json_response(text)


async def _generate_with_ollama(system_prompt: str, user_prompt: str) -> dict[str, str]:
    """Generate email draft using Ollama local model."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            },
        )
        response.raise_for_status()
        data = response.json()

    text = data.get("message", {}).get("content", "")
    return _parse_json_response(text)


# Map provider name to implementation
_PROVIDERS: dict[str, Any] = {
    "claude": _generate_with_claude,
    "grok": _generate_with_grok,
    "ollama": _generate_with_ollama,
}


async def generate_email_draft(job: Job) -> dict[str, str]:
    """
    Generate a cold outreach email draft for the given job.

    Returns: {"subject": "...", "body": "..."}
    Raises: Exception if JSON parsing fails after retry.
    """
    provider = settings.ai_provider
    generate_fn = _PROVIDERS.get(provider)

    if not generate_fn:
        raise ValueError(f"Unknown AI provider: {provider}")

    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(job)

    # First attempt
    try:
        return await generate_fn(system_prompt, user_prompt)
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning(f"First attempt JSON parse failed ({e}), retrying with explicit instruction")

    # Retry with stronger JSON instruction
    retry_prompt = (
        user_prompt
        + "\n\nIMPORTANT: Your previous response was not valid JSON. "
        "You MUST return ONLY a valid JSON object like: "
        '{"subject": "Your subject line", "body": "Your email body"}\n'
        "No other text, no markdown, no explanation."
    )

    try:
        return await generate_fn(system_prompt, retry_prompt)
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        raise RuntimeError(
            f"AI provider '{provider}' failed to return valid JSON after 2 attempts: {e}"
        ) from e
