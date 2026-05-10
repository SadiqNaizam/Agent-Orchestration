import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import JobResponse, OrchestrationPayload
from orchestrator import run_orchestration

load_dotenv()

# ── In-memory job store ────────────────────────────────────────────────────────
# Maps job_id → asyncio.Queue[dict]
_JOBS: dict[str, asyncio.Queue] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _JOBS.clear()


app = FastAPI(
    title="Agent Orchestration API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "active_jobs": len(_JOBS)}


@app.post("/api/orchestrate", response_model=JobResponse)
async def orchestrate(payload: OrchestrationPayload):
    """
    Accept an orchestration payload, spin up a background task,
    and return a job_id the client can use to subscribe to the SSE log stream.
    """
    if not payload.agents:
        raise HTTPException(status_code=422, detail="At least one agent is required")
    if not payload.tasks:
        raise HTTPException(status_code=422, detail="At least one task is required")

    job_id = str(uuid.uuid4())
    log_queue: asyncio.Queue = asyncio.Queue()
    _JOBS[job_id] = log_queue

    # Fire-and-forget background task
    asyncio.create_task(run_orchestration(payload, log_queue))

    return JobResponse(job_id=job_id, status="queued")


@app.get("/api/stream/{job_id}")
async def stream_logs(job_id: str):
    """
    Server-Sent Events endpoint.  The client opens this after receiving job_id
    from POST /api/orchestrate.  Streams until a {'type': 'done'} event is sent.
    """
    if job_id not in _JOBS:
        raise HTTPException(status_code=404, detail="Job not found")

    queue = _JOBS[job_id]

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=120.0)
                except asyncio.TimeoutError:
                    yield "data: " + json.dumps({"type": "error", "message": "Timeout waiting for log"}) + "\n\n"
                    break

                yield "data: " + json.dumps(item) + "\n\n"

                if item.get("type") == "done":
                    break
        finally:
            _JOBS.pop(job_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
