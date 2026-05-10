import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from chat_executor import run_chat_turn
from models import (
    ChatCreateRequest, ChatMessageRequest, ChatSession, ChatSessionInfo,
    JobResponse, OrchestrationConfig,
)
from orchestrator import run_orchestration

load_dotenv()

_JOBS: dict[str, asyncio.Queue] = {}
_SESSIONS: dict[str, ChatSession] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _JOBS.clear()
    _SESSIONS.clear()


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


# ── Chat endpoints ─────────────────────────────────────────────────────────────

@app.post("/chat/session")
async def create_chat_session(req: ChatCreateRequest):
    session_id = str(uuid.uuid4())
    session = ChatSession(
        session_id=session_id,
        agent=req.agent,
        messages=[],
        total_tokens=0,
        created_at=datetime.now(timezone.utc).isoformat(),
        compaction=req.compaction,
        api_key=req.api_key,
        api_key_type=req.api_key_type,
        azure_endpoint=req.azure_endpoint,
        azure_api_version=req.azure_api_version,
    )
    _SESSIONS[session_id] = session
    return {"session_id": session_id}


@app.get("/chat/session", response_model=List[ChatSessionInfo])
async def list_chat_sessions():
    return [
        ChatSessionInfo(
            session_id=s.session_id,
            agent_id=s.agent.agent_id,
            agent_name=s.agent.name,
            created_at=s.created_at,
            message_count=len(s.messages),
            total_tokens=s.total_tokens,
        )
        for s in _SESSIONS.values()
    ]


@app.post("/chat/session/{session_id}/message")
async def send_chat_message(session_id: str, req: ChatMessageRequest):
    if session_id not in _SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _SESSIONS[session_id]
    job_id  = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _JOBS[job_id] = queue

    asyncio.create_task(run_chat_turn(session, req.content, queue))

    return {"job_id": job_id}


@app.get("/chat/session/{session_id}/history")
async def get_chat_history(session_id: str):
    if session_id not in _SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    s = _SESSIONS[session_id]
    return {
        "session_id": session_id,
        "agent_id":   s.agent.agent_id,
        "messages":   s.messages,
        "total_tokens": s.total_tokens,
    }


@app.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str):
    _SESSIONS.pop(session_id, None)
    return {"status": "deleted"}
