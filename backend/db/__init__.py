"""
Database initialization and Beanie setup.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from backend.config import settings
from backend.db.models import Job, EmailDraft


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    client = AsyncIOMotorClient(settings.mongodb_url)
    database = client[settings.mongodb_db_name]
    await init_beanie(
        database=database,
        document_models=[Job, EmailDraft],
    )
