"""
Gmail API email sender with resume attachment.
Sends plain-text emails via the Gmail API (not SMTP).
"""

import base64
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.config import settings

logger = logging.getLogger(__name__)

# Gmail API send scope
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

RESUME_PATH = Path("resume/resume.pdf")


def _get_gmail_credentials() -> Credentials:
    """Load Gmail credentials, auto-refresh if expired."""
    token_path = Path(settings.gmail_token_path)

    if not token_path.exists():
        raise FileNotFoundError(
            f"Gmail token not found at {token_path}. "
            "Run 'python cli.py auth-gmail' first."
        )

    creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    # Refresh if expired
    if creds and creds.expired and creds.refresh_token:
        logger.info("Gmail token expired, refreshing...")
        creds.refresh(Request())

        # Save refreshed token
        with open(token_path, "w") as f:
            f.write(creds.to_json())
        logger.info("Gmail token refreshed and saved.")

    if not creds or not creds.valid:
        raise RuntimeError(
            "Gmail credentials are invalid. Run 'python cli.py auth-gmail' to re-authorize."
        )

    return creds


def _build_email_message(
    to: str,
    subject: str,
    body: str,
    attach_resume: bool = True,
) -> str:
    """Build a MIME email message and return as base64url encoded string."""
    message = MIMEMultipart()
    message["From"] = settings.gmail_address
    message["To"] = to
    message["Subject"] = subject

    # Plain text body — looks more human than HTML
    message.attach(MIMEText(body, "plain"))

    # Attach resume if available
    if attach_resume and RESUME_PATH.exists():
        with open(RESUME_PATH, "rb") as f:
            resume_data = f.read()

        attachment = MIMEApplication(resume_data, _subtype="pdf")
        attachment.add_header(
            "Content-Disposition",
            "attachment",
            filename="resume.pdf",
        )
        message.attach(attachment)
    elif attach_resume:
        logger.warning(f"Resume not found at {RESUME_PATH}, sending without attachment")

    # Encode as base64url
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return raw


async def send_email(to: str, subject: str, body: str) -> str:
    """
    Send an email via the Gmail API with resume attachment.

    Args:
        to: Recipient email address
        subject: Email subject line
        body: Plain text email body

    Returns:
        Gmail message ID of the sent email

    Raises:
        FileNotFoundError: If Gmail token doesn't exist
        RuntimeError: If credentials are invalid
    """
    import asyncio

    def _send_sync() -> str:
        creds = _get_gmail_credentials()
        service = build("gmail", "v1", credentials=creds)

        raw_message = _build_email_message(to, subject, body)

        result = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw_message})
            .execute()
        )

        message_id = result.get("id", "unknown")
        logger.info(f"Email sent to {to} — Gmail message ID: {message_id}")
        return message_id

    # Run synchronous Gmail API call in thread pool
    loop = asyncio.get_event_loop()
    message_id = await loop.run_in_executor(None, _send_sync)
    return message_id
