import asyncio
import io
import logging
import sys
import threading
from typing import AsyncGenerator

from crewai import Agent, Task, Crew, Process, LLM

from models import OrchestrationPayload


# ──────────────────────────────────────────────
# Stdout capture: redirects stdout written from
# the worker thread into the async log queue
# ──────────────────────────────────────────────
class _QueueStream(io.TextIOBase):
    def __init__(self, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
        self._queue = queue
        self._loop = loop
        self._buf = ""

    def write(self, text: str) -> int:
        self._buf += text
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            clean = line.rstrip()
            if clean:
                asyncio.run_coroutine_threadsafe(
                    self._queue.put({"type": "log", "message": clean}),
                    self._loop,
                )
        return len(text)

    def flush(self):
        pass


# ──────────────────────────────────────────────
# Logging handler: captures crewai/litellm logs
# ──────────────────────────────────────────────
class _AsyncQueueHandler(logging.Handler):
    def __init__(self, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
        super().__init__()
        self._queue = queue
        self._loop = loop

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            level = record.levelname.lower()
            log_type = "warning" if level == "warning" else "log"
            asyncio.run_coroutine_threadsafe(
                self._queue.put({"type": log_type, "message": msg}),
                self._loop,
            )
        except Exception:
            pass


def _emit(queue: asyncio.Queue, loop: asyncio.AbstractEventLoop, msg: str, kind: str = "info"):
    asyncio.run_coroutine_threadsafe(
        queue.put({"type": kind, "message": msg}),
        loop,
    )


def _build_and_run(
    payload: OrchestrationPayload,
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
):
    """Runs synchronously inside a thread-pool executor."""

    emit = lambda msg, kind="info": _emit(queue, loop, msg, kind)

    # ── Set API keys ──────────────────────────────────────────────────────
    if payload.api_key:
        import os, litellm
        if payload.api_key_type == "anthropic":
            os.environ["ANTHROPIC_API_KEY"] = payload.api_key
            litellm.anthropic_key = payload.api_key
        elif payload.api_key_type == "gemini":
            os.environ["GEMINI_API_KEY"] = payload.api_key
        elif payload.api_key_type == "azure":
            os.environ["AZURE_API_KEY"] = payload.api_key
            litellm.api_key = payload.api_key
            if payload.azure_endpoint:
                os.environ["AZURE_API_BASE"] = payload.azure_endpoint
            if payload.azure_api_version:
                os.environ["AZURE_API_VERSION"] = payload.azure_api_version
        else:
            os.environ["OPENAI_API_KEY"] = payload.api_key
            litellm.openai_key = payload.api_key

    # ── Redirect stdout + attach logging handler ──────────────────────────
    orig_stdout = sys.stdout
    orig_stderr = sys.stderr
    qs = _QueueStream(queue, loop)
    sys.stdout = qs  # type: ignore
    sys.stderr = qs  # type: ignore

    log_handler = _AsyncQueueHandler(queue, loop)
    log_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root_logger = logging.getLogger()
    root_logger.addHandler(log_handler)

    try:
        # ── Build agents ──────────────────────────────────────────────────
        emit("━" * 60)
        emit(f"🚀  Orchestration starting", "info")
        emit(f"   Agents : {len(payload.agents)}")
        emit(f"   Tasks  : {len(payload.tasks)}")
        emit(f"   Process: {payload.flow.process}")
        emit("━" * 60)

        agents_map: dict[str, Agent] = {}
        for ac in payload.agents:
            emit(f"🤖  Building agent → {ac.name}  [{ac.llm}]", "info")
            llm = LLM(model=ac.llm)
            backstory = ac.backstory or (
                f"You are {ac.name}, a highly capable AI assistant specialised in your role."
            )
            agent = Agent(
                role=ac.role,
                goal=ac.goal,
                backstory=backstory,
                llm=llm,
                verbose=True,
            )
            agents_map[ac.id] = agent
            emit(f"   ✔ Agent '{ac.name}' ready", "success")

        # ── Build tasks ───────────────────────────────────────────────────
        tasks: list[Task] = []
        for tc in payload.tasks:
            preview = tc.description[:70] + ("…" if len(tc.description) > 70 else "")
            emit(f"📋  Building task → {preview}", "info")

            agent = agents_map.get(tc.agent_id)
            if not agent:
                emit(f"   ⚠ No agent found for id='{tc.agent_id}' — skipping", "warning")
                continue

            task = Task(
                description=tc.description,
                expected_output=tc.expected_output,
                agent=agent,
            )
            tasks.append(task)
            emit(f"   ✔ Task ready", "success")

        if not tasks:
            emit("❌  No valid tasks to run. Aborting.", "error")
            return

        # ── Assemble crew ─────────────────────────────────────────────────
        process = (
            Process.sequential
            if payload.flow.process == "sequential"
            else Process.hierarchical
        )

        crew_kwargs: dict = dict(
            agents=list(agents_map.values()),
            tasks=tasks,
            process=process,
            verbose=True,
        )

        if process == Process.hierarchical:
            mgr_model = payload.flow.manager_llm or "openai/gpt-4o-mini"
            emit(f"👔  Adding manager LLM → {mgr_model}", "info")
            crew_kwargs["manager_llm"] = LLM(model=mgr_model)

        emit("▶️   Kicking off crew …", "info")
        crew = Crew(**crew_kwargs)
        result = crew.kickoff()

        emit("━" * 60)
        emit("✅  Orchestration complete!", "success")
        emit("━" * 60)
        emit(f"📊  Final Result:\n{result}", "result")

    except Exception as exc:
        emit(f"❌  Error: {exc}", "error")
        raise
    finally:
        sys.stdout = orig_stdout
        sys.stderr = orig_stderr
        root_logger.removeHandler(log_handler)


async def run_orchestration(
    payload: OrchestrationPayload,
    log_queue: asyncio.Queue,
) -> None:
    """Entry-point called from the FastAPI background task."""
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _build_and_run, payload, log_queue, loop)
    except Exception:
        pass
    finally:
        await log_queue.put({"type": "done", "message": "stream_end"})
