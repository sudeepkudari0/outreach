"""
FastAPI application — main entry point.
Handles CORS, router registration, DB init, scheduler, and WebSocket.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.scheduler import start_scheduler, stop_scheduler
from backend.routers import jobs, emails, stats
from backend.agent import router as agent_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

# --- WebSocket management ---

connected_clients: Set[WebSocket] = set()


async def ws_broadcast(message: str) -> None:
    """Broadcast a message to all connected WebSocket clients."""
    global connected_clients
    disconnected = set()
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    connected_clients -= disconnected


# --- Application lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting up...")

    # Initialize database
    await init_db()
    logger.info("Database initialized.")

    # Start scheduler
    start_scheduler()
    logger.info("Scheduler started.")

    # Set WebSocket broadcast on routers
    jobs.set_ws_broadcast(ws_broadcast)

    yield

    # Shutdown
    stop_scheduler()
    logger.info("Shutdown complete.")


# --- FastAPI app ---

app = FastAPI(
    title="Job Outreach Automation API",
    description="Backend for automated job scraping, AI email drafting, and Gmail sending.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow dashboard at localhost:3000 and Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://outreach.sudeepkudari.online",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(jobs.router)
app.include_router(emails.router)
app.include_router(stats.router)
app.include_router(agent_router.router)


# --- WebSocket endpoint ---


@app.websocket("/ws/crawl-log")
async def crawl_log_ws(websocket: WebSocket):
    """WebSocket endpoint for streaming live scrape progress."""
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info(f"WebSocket client connected. Total: {len(connected_clients)}")

    try:
        while True:
            # Keep connection alive — wait for client messages (e.g. pings)
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(connected_clients)}")


# --- Resume upload endpoint ---


@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload/replace the resume PDF."""
    from pathlib import Path

    resume_path = Path("resume/resume.pdf")
    resume_path.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    with open(resume_path, "wb") as f:
        f.write(content)

    return {"message": "Resume uploaded successfully", "size": len(content)}


# --- Health check ---


@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "job-outreach-backend"}
