"""
Gmail OAuth2 one-time setup flow.
Run via CLI: python cli.py auth-gmail
"""

import json
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from backend.config import settings

# Gmail API send scope
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def run_gmail_oauth_flow() -> None:
    """
    Run the OAuth2 authorization flow for Gmail API.
    Opens a browser for user consent, then saves the token locally.
    """
    credentials_path = Path(settings.gmail_credentials_path)
    token_path = Path(settings.gmail_token_path)

    if not credentials_path.exists():
        print(f"\n❌ Gmail credentials file not found at: {credentials_path}")
        print("Please download your OAuth2 Desktop App credentials from:")
        print("  https://console.cloud.google.com/apis/credentials")
        print(f"and save the JSON file to: {credentials_path}\n")
        return

    # Check if token already exists
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
            if creds and creds.valid:
                print("✅ Gmail token already exists and is valid.")
                return
        except Exception:
            pass  # Token is invalid, proceed with new flow

    print("\n🔐 Starting Gmail OAuth2 authorization flow...")
    print("A browser window will open. Please authorize the application.\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
    creds = flow.run_local_server(port=0)

    # Save token
    token_path.parent.mkdir(parents=True, exist_ok=True)
    with open(token_path, "w") as f:
        f.write(creds.to_json())

    print(f"\n✅ Gmail token saved to {token_path}")
    print(f"   Authorized as: {settings.gmail_address}")
    print("   You can now send emails through the application.\n")
