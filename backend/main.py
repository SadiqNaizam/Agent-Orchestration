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
from layers.execution import HitlGate
from models import (
    ChatCreateRequest, ChatMessageRequest, ChatSession, ChatSessionInfo,
    HitlResumeRequest, JobResponse, OrchestrationConfig,
    PensieveApproveRequest, PensieveMessageRequest, PensieveRunInfo, PensieveStartRequest,
)
from orchestrator import run_orchestration
from pensieve.process_parser import parse_process_md, ProcessParseError
from pensieve.runner import PensieveRunner

load_dotenv()

_JOBS: dict[str, asyncio.Queue] = {}
_SESSIONS: dict[str, ChatSession] = {}
_HITL: dict[str, HitlGate] = {}

# Pensieve: run_id → PensieveRunner
_PENSIEVE: dict[str, PensieveRunner] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _JOBS.clear()
    _SESSIONS.clear()
    _HITL.clear()
    _PENSIEVE.clear()


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
    gate = HitlGate(job_id)
    _JOBS[job_id]  = queue
    _HITL[job_id]  = gate

    asyncio.create_task(run_orchestration(config, queue, gate))

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
            _HITL.pop(job_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/jobs/{job_id}/hitl")
async def resume_hitl(job_id: str, req: HitlResumeRequest):
    gate = _HITL.get(job_id)
    if gate is None:
        raise HTTPException(status_code=404, detail="Job not found or no active HITL checkpoint")
    gate.resume(req.input)
    return {"status": "resumed", "job_id": job_id}


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


# ── Pensieve endpoints ────────────────────────────────────────────────────────

@app.post("/api/pensieve/start", response_model=PensieveRunInfo)
async def pensieve_start(req: PensieveStartRequest):
    """Parse a process.md, initialise a run, and start the main agent."""
    try:
        process_def = parse_process_md(req.process_md)
    except ProcessParseError as exc:
        raise HTTPException(status_code=422, detail=f"process.md parse error: {exc}")

    run_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()

    runner = PensieveRunner.create(
        process_def=process_def,
        run_id=run_id,
        queue=queue,
        model=req.model,
        api_key=req.api_key,
        api_key_type=req.api_key_type,
        azure_endpoint=req.azure_endpoint,
        azure_api_version=req.azure_api_version,
        project_brief=req.project_brief,
    )
    _PENSIEVE[run_id] = runner

    # Register the queue so the stream endpoint can find it
    _JOBS[run_id] = queue

    # Kick off the greeting in the background
    asyncio.create_task(runner.start())

    return PensieveRunInfo(
        run_id=run_id,
        status="running",
        process_id=process_def.process_id,
        process_label=process_def.label,
        current_phase=runner.state.current_phase,
        current_step=runner.state.current_step,
        created_at=datetime.now(timezone.utc).isoformat(),
        message_count=0,
        total_tokens=0,
    )



@app.post("/api/pensieve/{run_id}/message")
async def pensieve_message(run_id: str, req: PensieveMessageRequest):
    """Send a user message to the main agent."""
    runner = _PENSIEVE.get(run_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Run not found")
    asyncio.create_task(runner.send_message(req.content))
    return {"status": "processing", "run_id": run_id}


@app.post("/api/pensieve/{run_id}/approve")
async def pensieve_approve(run_id: str, req: PensieveApproveRequest):
    """Approve (or reject) the current step gate."""
    runner = _PENSIEVE.get(run_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Run not found")
    if req.approved:
        await runner.approve_step(feedback=req.feedback)
    else:
        # Rejected — just send as a chat message
        asyncio.create_task(
            runner.send_message(req.feedback or "Please revise this output.")
        )
    return {"status": "ok", "run_id": run_id}


@app.get("/api/pensieve/{run_id}/state")
async def pensieve_state(run_id: str):
    """Get the current process state."""
    runner = _PENSIEVE.get(run_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "state":    runner.state.to_dict(),
        "phases":   runner.state.phases_summary(),
        "artifacts": runner.artifacts.list_all(),
    }


@app.get("/api/pensieve/{run_id}/artifact/{artifact_key}")
async def pensieve_artifact(run_id: str, artifact_key: str):
    """Get the current data for a specific artifact."""
    runner = _PENSIEVE.get(run_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Run not found")
    data = runner.artifacts.read(artifact_key)
    meta = runner.artifacts.get_meta(artifact_key)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Artifact '{artifact_key}' not yet generated")
    return {"artifact_key": artifact_key, "data": data, "meta": meta}


@app.get("/api/pensieve/{run_id}/artifact/{artifact_key}/history")
async def pensieve_artifact_history(run_id: str, artifact_key: str):
    """Get the version history for an artifact."""
    runner = _PENSIEVE.get(run_id)
    if not runner:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "artifact_key": artifact_key,
        "history": runner.artifacts.get_history(artifact_key),
    }


@app.get("/api/pensieve")
async def pensieve_list():
    """List all active process runs."""
    return [
        {
            "run_id":       run_id,
            "process_id":   r.process_def.process_id,
            "process_label": r.process_def.label,
            "status":       r.state.status,
            "current_step": r.state.current_step,
        }
        for run_id, r in _PENSIEVE.items()
    ]
