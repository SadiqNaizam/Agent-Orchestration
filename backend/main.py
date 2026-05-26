import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from chat_executor import run_chat_turn
from layers.execution import HitlGate
from models import (
    ChatCreateRequest, ChatMessageRequest, ChatSession, ChatSessionInfo,
    HitlResumeRequest, JobResponse, OrchestrationConfig,
    PensieveApproveRequest, PensieveMessageRequest, PensieveResumeRequest,
    PensieveRunInfo, PensieveStartRequest,
)
from orchestrator import run_orchestration
from pensieve.process_parser import parse_process_md, parse_process_pack, ProcessParseError
from pensieve.runner import PensieveRunner

# Directory where built-in process packs live (backend/process_packs/<pack_id>/)
_PACKS_DIR = os.path.join(os.path.dirname(__file__), "process_packs")

load_dotenv()

# logging.basicConfig is a no-op when uvicorn has already set up the root
# logger. Explicitly set the level on the "pensieve" namespace so all child
# loggers (pensieve.api, pensieve.runner) output at INFO regardless of the
# root logger's level.
logging.getLogger("pensieve").setLevel(logging.INFO)
logger = logging.getLogger("pensieve.api")

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
    short_id = job_id[:8]

    # For Pensieve runs that have reconnected after the first SSE connection
    # closed (EventSource auto-reconnect), the queue may already be gone from
    # _JOBS but the runner is still alive in _PENSIEVE.  Re-register the queue
    # so the client can resume receiving events.
    if job_id not in _JOBS:
        runner = _PENSIEVE.get(job_id)
        if runner:
            logger.info(f"[SSE] {short_id} — reconnect detected, re-registering Pensieve queue")
            _JOBS[job_id] = runner.queue
        else:
            logger.warning(f"[SSE] {short_id} — 404: job not found and no Pensieve runner")
            raise HTTPException(status_code=404, detail="Job not found")

    queue = _JOBS[job_id]
    is_pensieve = job_id in _PENSIEVE

    logger.info(f"[SSE] {short_id} — client connected (pensieve={is_pensieve}, queue_size={queue.qsize()})")

    async def event_generator():
        events_sent = 0
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=300.0)
                except asyncio.TimeoutError:
                    logger.warning(f"[SSE] {short_id} — stream timeout after {events_sent} events")
                    yield "data: " + json.dumps({
                        "type": "event",
                        "data": {
                            "event_type": "error",
                            "payload": {"message": "Stream timeout", "error_type": "timeout", "policy_applied": "fail"},
                        },
                    }) + "\n\n"
                    break

                event_type = item.get("data", {}).get("event_type", "") if item.get("type") == "event" else item.get("type", "")
                events_sent += 1
                logger.info(f"[SSE] {short_id} → #{events_sent} type={item.get('type')} event={event_type}")

                yield "data: " + json.dumps(item) + "\n\n"

                if item.get("type") == "done":
                    logger.info(f"[SSE] {short_id} — stream complete after {events_sent} events")
                    break
        except Exception as exc:
            logger.error(f"[SSE] {short_id} — generator error: {exc}", exc_info=True)
        finally:
            logger.info(f"[SSE] {short_id} — client disconnected (sent {events_sent} events)")
            # Only clean up _JOBS for non-Pensieve runs.
            # Pensieve runs stay in _JOBS so that EventSource auto-reconnects work.
            # They are cleaned up when the Pensieve runner finishes or the server shuts down.
            if job_id not in _PENSIEVE:
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
    """Parse a process definition, initialise a run, and start the main agent.

    Accepts either a single-file ``process_md`` string or a ``process_pack``
    dict mapping relative paths to file contents.
    """
    pack_files: Dict[str, str] | None = None
    process_md_str: str = ""

    try:
        if req.process_pack:
            # Pack mode — dict of {rel_path: content}
            pack_files = {k: str(v) for k, v in req.process_pack.items()}
            process_def = parse_process_pack(pack_files)
        elif req.process_md:
            # Single-file backward-compat mode
            process_md_str = req.process_md
            process_def = parse_process_md(process_md_str)
        else:
            raise HTTPException(
                status_code=422,
                detail="Either process_md or process_pack must be provided.",
            )
    except ProcessParseError as exc:
        raise HTTPException(status_code=422, detail=f"Process parse error: {exc}")

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
        process_md=process_md_str,
        process_pack_files=pack_files,
    )
    _PENSIEVE[run_id] = runner

    # Register the queue so the stream endpoint can find it
    _JOBS[run_id] = queue

    logger.info(
        f"[PENSIEVE] run_id={run_id[:8]} process={process_def.process_id} "
        f"steps={len(process_def.steps)} model={req.model or process_def.default_model} "
        f"api_key_type={req.api_key_type} has_brief={req.project_brief is not None} "
        f"mode={'pack' if pack_files else 'single_file'}"
    )

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
        # Guard against duplicate approvals: if the gate event is already set
        # (a previous call already woke wait_for_approval), silently ignore.
        if runner.state._approval_event.is_set():
            logger.warning(f"[PENSIEVE] run_id={run_id[:8]} duplicate approve ignored (gate already resolved)")
            return {"status": "already_resolved", "run_id": run_id}
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


@app.post("/api/pensieve/{run_id}/resume", response_model=PensieveRunInfo)
async def pensieve_resume(run_id: str, req: PensieveResumeRequest):
    """
    Resume a previously saved run after a session timeout or page reload.

    If the runner is still live in memory, just re-emits state.
    If it was lost (server restart), it restores from the save file.
    """
    runner = _PENSIEVE.get(run_id)

    if runner is None:
        # Try restoring from disk
        if not PensieveRunner.saved_run_exists(run_id):
            raise HTTPException(
                status_code=404,
                detail=f"Run '{run_id}' not found in memory or on disk.",
            )
        queue: asyncio.Queue = asyncio.Queue()
        try:
            runner = PensieveRunner.restore(
                run_id=run_id,
                queue=queue,
                api_key=req.api_key,
                api_key_type_override=req.api_key_type,
            )
        except Exception as exc:
            logger.error(f"[PENSIEVE] restore failed for {run_id[:8]}: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to restore run: {exc}")

        _PENSIEVE[run_id] = runner
        _JOBS[run_id]     = queue
        logger.info(f"[PENSIEVE] run_id={run_id[:8]} restored from disk")
    else:
        # Runner still live — just re-assign its queue so the new SSE
        # connection gets the re-emitted events.
        _JOBS[run_id] = runner.queue
        logger.info(f"[PENSIEVE] run_id={run_id[:8]} live resume (runner already in memory)")

    asyncio.create_task(runner.resume())

    return PensieveRunInfo(
        run_id=run_id,
        status=runner.state.status,
        process_id=runner.process_def.process_id,
        process_label=runner.process_def.label,
        current_phase=runner.state.current_phase,
        current_step=runner.state.current_step,
        created_at=runner.state.started_at,
        message_count=len(runner.conversation),
        total_tokens=0,
    )


@app.get("/api/pensieve/{run_id}/saved")
async def pensieve_saved_check(run_id: str):
    """Check whether a save file exists for this run_id (used by the frontend on load)."""
    exists = PensieveRunner.saved_run_exists(run_id)
    return {"run_id": run_id, "exists": exists}


# ── Process pack catalogue ─────────────────────────────────────────────────────

def _load_pack_dir(pack_path: str) -> Dict[str, str]:
    """Walk a process pack directory and return {relative_path → file_content}."""
    files: Dict[str, str] = {}
    for root, _, fnames in os.walk(pack_path):
        for fname in fnames:
            if fname.endswith(".md"):
                full_path = os.path.join(root, fname)
                rel_path  = os.path.relpath(full_path, pack_path).replace("\\", "/")
                try:
                    with open(full_path, encoding="utf-8") as f:
                        files[rel_path] = f.read()
                except OSError:
                    pass
    return files


@app.get("/api/pensieve/packs")
async def list_process_packs():
    """List available built-in process packs from the backend process_packs directory."""
    packs = []
    if not os.path.isdir(_PACKS_DIR):
        return packs
    for pack_id in sorted(os.listdir(_PACKS_DIR)):
        pack_path = os.path.join(_PACKS_DIR, pack_id)
        if not os.path.isdir(pack_path):
            continue
        files = _load_pack_dir(pack_path)
        if not files:
            continue
        try:
            pd = parse_process_pack(files)
            packs.append({
                "id":          pack_id,
                "label":       pd.label,
                "description": pd.description,
                "steps":       len(pd.steps),
                "phases":      len(pd.phases),
            })
        except Exception as exc:
            logger.warning(f"[PACKS] Could not parse pack '{pack_id}': {exc}")
            packs.append({"id": pack_id, "label": pack_id, "description": "", "steps": 0, "phases": 0})
    return packs


@app.get("/api/pensieve/packs/{pack_id}")
async def get_process_pack(pack_id: str):
    """Return all .md files for a named built-in process pack."""
    # Sanitise: no path traversal
    if "/" in pack_id or "\\" in pack_id or pack_id.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid pack ID.")
    pack_path = os.path.join(_PACKS_DIR, pack_id)
    if not os.path.isdir(pack_path):
        raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found.")
    files = _load_pack_dir(pack_path)
    return {"pack_id": pack_id, "files": files}
