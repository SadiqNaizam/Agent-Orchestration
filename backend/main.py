import asyncio
import json
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import JobResponse, OrchestrationConfig
from orchestrator import run_orchestration

load_dotenv()

_JOBS: dict[str, asyncio.Queue] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _JOBS.clear()


app = FastAPI(
    title="Agent Orchestration API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "active_jobs": len(_JOBS)}


@app.post("/api/orchestrate", response_model=JobResponse)
async def orchestrate(config: OrchestrationConfig):
    if not config.nodes and not config.presets:
        raise HTTPException(
            status_code=422,
            detail="Config must include at least one node or preset.",
        )

    job_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _JOBS[job_id] = queue

    asyncio.create_task(run_orchestration(config, queue))

    return JobResponse(job_id=job_id, status="queued")


@app.get("/api/stream/{job_id}")
async def stream_logs(job_id: str):
    if job_id not in _JOBS:
        raise HTTPException(status_code=404, detail="Job not found")

    queue = _JOBS[job_id]

    async def event_generator():
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=300.0)
                except asyncio.TimeoutError:
                    yield "data: " + json.dumps({
                        "type": "event",
                        "data": {
                            "event_type": "error",
                            "payload": {"message": "Stream timeout", "error_type": "timeout", "policy_applied": "fail"},
                        },
                    }) + "\n\n"
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
            "X-Accel-Buffering": "no",
        },
    )
