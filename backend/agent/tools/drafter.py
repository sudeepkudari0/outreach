"""
AI email drafter — uses the configured AI provider (Grok or Ollama) to write
a short, 3-sentence cold outreach email.

Reads the user's resume from resume/resume.txt for personalization.
"""

import json
import logging
from pathlib import Path
from typing import Any

import httpx
import openai

from backend.config import settings

logger = logging.getLogger(__name__)

# Resume file path — relative to project root (job-outreach/)
RESUME_PATH = Path(__file__).resolve().parent.parent.parent.parent / "resume" / "resume.txt"

SYSTEM_PROMPT = """You are writing a cold outreach email to a recruiter on behalf of a job seeker.

Rules:
1. EXACTLY 3 sentences. No more.
2. Sentence 1: Mention you applied for / are interested in the specific role.
3. Sentence 2: One brief reason why you're a good fit (pull from the resume).
4. Sentence 3: Simple ask — "Would love to chat if you think there's a fit."
5. Tone: professional, confident, human. NOT salesy or desperate.
6. No "I hope this email finds you well" or any filler.
7. No bullet points, no lists, no formatting.
8. Return ONLY valid JSON: {"subject": "...", "body": "..."}
9. Subject line should be short and direct.
10. Address the recruiter by first name.
11. Sign off with the sender's name."""


def _load_resume() -> str:
    """Load resume text from file. Returns empty string if not found."""
    if RESUME_PATH.exists():
        text = RESUME_PATH.read_text().strip()
        logger.info(f"Loaded resume ({len(text)} chars) from {RESUME_PATH}")
        return text

    logger.warning(f"Resume file not found at {RESUME_PATH}. Create resume/resume.txt with your resume text.")
    return ""


def _build_user_prompt(
    recruiter_name: str,
    company: str,
    job_title: str,
    my_name: str,
    my_background: str,
    resume_text: str,
) -> str:
    """Build the user prompt with all context."""
    resume_section = ""
    if resume_text:
        # Truncate to avoid token limits
        truncated = resume_text[:3000]
        resume_section = f"\n\nResume:\n---\n{truncated}\n---"

    return f"""Write a cold outreach email for this job.

Recruiter name: {recruiter_name}
Company: {company}
Job title: {job_title}
Sender name: {my_name}
Sender background: {my_background}
{resume_section}

Return ONLY a JSON object with "subject" and "body" keys. Nothing else."""


def _parse_response(text: str) -> dict[str, str]:
    """Parse JSON from AI response."""
    cleaned = text.strip()

    # Remove markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    result = json.loads(cleaned)

    if "subject" not in result or "body" not in result:
        raise ValueError("Response missing 'subject' or 'body'")

    return {"subject": str(result["subject"]), "body": str(result["body"])}


async def _generate_with_grok(system_prompt: str, user_prompt: str) -> dict[str, str]:
    """Generate using Grok (OpenAI-compatible API)."""
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
        max_tokens=512,
    )

    text = response.choices[0].message.content or ""
    return _parse_response(text)


async def _generate_with_ollama(system_prompt: str, user_prompt: str) -> dict[str, str]:
    """Generate using Ollama local model."""
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
    return _parse_response(text)


_PROVIDERS: dict[str, Any] = {
    "grok": _generate_with_grok,
    "ollama": _generate_with_ollama,
}


async def draft_outreach_email(
    recruiter_name: str,
    company: str,
    job_title: str,
    my_name: str,
    my_background: str,
) -> str:
    """
    Draft a 3-sentence cold outreach email using the configured AI provider.

    Reads resume from resume/resume.txt for personalization.
    Returns formatted email string (Subject + Body).
    """
    provider = settings.ai_provider
    generate_fn = _PROVIDERS.get(provider)

    if not generate_fn:
        raise ValueError(
            f"AI provider '{provider}' not supported for agent drafter. Use 'grok' or 'ollama'."
        )

    resume_text = _load_resume()

    user_prompt = _build_user_prompt(
        recruiter_name=recruiter_name,
        company=company,
        job_title=job_title,
        my_name=my_name,
        my_background=my_background,
        resume_text=resume_text,
    )

    # First attempt
    try:
        result = await generate_fn(SYSTEM_PROMPT, user_prompt)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"First attempt failed ({e}), retrying...")

        # Retry with stronger instruction
        retry_prompt = (
            user_prompt
            + "\n\nIMPORTANT: Return ONLY valid JSON like: "
            '{"subject": "your subject", "body": "your 3-sentence email"}'
        )
        result = await generate_fn(SYSTEM_PROMPT, retry_prompt)

    return f"Subject: {result['subject']}\n\n{result['body']}"
