"""
Configuration module — loads all settings from .env via pydantic-settings.
Import the singleton `settings` object throughout the backend.
"""

from pathlib import Path
from typing import Literal, Optional
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator

# Resolve .env relative to this file's parent (job-outreach/)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """All application settings loaded from environment variables."""

    # MongoDB
    mongodb_url: str = "mongodb+srv://sudeepkudari0_db_user:LgSv19mHScRkpoTV@cluster0.aelcpdl.mongodb.net/outreach"
    mongodb_db_name: str = "job_outreach"

    # AI Provider
    ai_provider: Literal["claude", "grok", "ollama"] = "grok"

    # Claude
    anthropic_api_key: Optional[str] = None

    # Grok
    grok_api_key: Optional[str] = None
    grok_base_url: str = "https://api.groq.com/openai/v1"
    grok_model: str = "llama-3.3-70b-versatile"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Gmail
    gmail_address: str = "you@gmail.com"
    gmail_credentials_path: str = "backend/secrets/gmail_credentials.json"
    gmail_token_path: str = "backend/secrets/gmail_token.json"

    # LinkedIn scraper
    linkedin_search_keywords: str = "full stack developer"
    linkedin_search_location: Optional[str] = None
    linkedin_cookies_path: str = "backend/session/linkedin_cookies.json"

    # User profile — used by AI email writer
    my_name: str = "Your Full Name"
    my_role: str = "Full Stack Developer"
    my_skills: str = "React, Node.js, Python, PostgreSQL, AWS"
    my_experience_years: int = 3
    my_linkedin_url: str = "https://linkedin.com/in/yourprofile"
    my_github_url: str = "https://github.com/yourusername"
    my_portfolio_url: str = "https://yourportfolio.com"

    # Automation
    daily_send_limit: int = 20
    scrape_schedule_hour: int = 8

    # Dashboard auth
    nextauth_secret: str = "generate_a_random_32_char_string"
    nextauth_url: str = "http://localhost:3000"
    dashboard_username: str = "admin"
    dashboard_password: str = "changeme"

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}

    @model_validator(mode="after")
    def validate_provider_keys(self) -> "Settings":
        """Ensure required API keys are set for the selected provider."""
        if self.ai_provider == "claude" and not self.anthropic_api_key:
            raise ValueError(
                "AI_PROVIDER is set to 'claude' but ANTHROPIC_API_KEY is not set. "
                "Please set it in your .env file."
            )
        if self.ai_provider == "grok" and not self.grok_api_key:
            raise ValueError(
                "AI_PROVIDER is set to 'grok' but GROK_API_KEY is not set. "
                "Please set it in your .env file."
            )
        return self


settings = Settings()
