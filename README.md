# Job Outreach Automation

A complete, fully local system for automating job searching and cold outreach emails entirely from your machine. No cloud dependencies, no third-party email APIs.

Built with Python (FastAPI, Beanie, Playwright), Next.js, and MongoDB.

## Features

- **Automated Scraping**: Scrapes LinkedIn (via Playwright session) and Naukri for matching keywords.
- **AI Email Drafting**: Generates personalized cold emails using Anthropic Claude, Grok, or local Ollama.
- **Smart Filtering**: Automatically extracts recruiter emails and filters out generic support/no-reply addresses.
- **Gmail Integration**: Sends directly through your own Gmail account via OAuth2 — completely free, looks human.
- **Kanban Dashboard**: Next.js dashboard to manage the pipeline (Found → Drafted → Approved → Sent).
- **Daily Limits**: Strict server-side enforcement of daily sending limits (e.g., 20/day) with 30s intervals between sends.

## Prerequisites

- Python 3.11+
- Node.js & Bun (or npm)
- Docker (for MongoDB, optional if running Mongo locally)
- A Google Cloud Project with Gmail API enabled (free)

## Quick Setup

### 1. Database

Start MongoDB locally via Docker:

```bash
docker-compose up -d
```

### 2. Backend Config

Copy the environment template and fill in your keys:

```bash
cp .env.example .env
```

_Essential keys: `AI_PROVIDER` (and corresponding API key), `GMAIL_ADDRESS`, and your dashboard password._

### 3. Backend Setup

Create your virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

### 4. Authentication (Crucial Step)

**Gmail Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Gmail API**
3. Create **OAuth 2.0 Client IDs** (Desktop application)
4. Download the JSON and save it as `backend/secrets/gmail_credentials.json`
5. Run the one-time auth script:

```bash
python backend/cli.py auth-gmail
```

**LinkedIn Setup:**
Since LinkedIn has strict anti-bot measures, we use a real session cookie.
Run this script, which opens a headed browser. Log in manually, and it will save your cookies.

```bash
python backend/cli.py auth-linkedin
```

### 5. Running the Application

Start the backend (FastAPI):

```bash
uvicorn backend.main:app --reload
```

Start the dashboard (Next.js):

```bash
cd dashboard
bun install
bun run dev
```

Dashboard will be available at [http://localhost:3000](http://localhost:3000).

## Daily Workflow

1. The scheduler runs daily at your configured `SCRAPE_SCHEDULE_HOUR`.
2. New jobs go to the **Drafted** column.
3. Review and edit the AI-generated drafts in the dashboard.
4. Drag to **Approved** or click the Approve button.
5. Click **Send All Approved** on the emails page, or run `python backend/cli.py send-approved`.

## CLI Usage

The backend includes a powerful Typer CLI for managing the system without the UI:

```bash
python backend/cli.py scrape --site all       # Trigger an immediate scrape
python backend/cli.py review                  # Interactively approve/edit drafts in terminal
python backend/cli.py stats                   # View total counts and success rates
```
