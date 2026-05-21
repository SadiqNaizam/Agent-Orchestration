"""
Orchestrator — wires the three layers together and drives a single run.

Called from main.py as an asyncio background task.
Puts structured event envelopes into log_queue until the terminal
{"type": "done"} sentinel is placed at the end.
"""

import asyncio
import time
from typing import Optional

from blackboard import Blackboard
from layers.definition import DefinitionError, validate_config
from layers.execution import HitlGate, run_dag
from layers.resolution import ResolutionError, resolve
from models import OrchestrationConfig
from streaming import StreamingEmitter


async def run_orchestration(
    config: OrchestrationConfig,
    log_queue: asyncio.Queue,
    hitl_gate: Optional[HitlGate] = None,
) -> None:
    emitter    = StreamingEmitter(config.orchestration_id, log_queue)
    start_time = time.time()

    def _elapsed_ms() -> int:
        return int((time.time() - start_time) * 1000)

    try:
        # ── 1. Definition Layer ───────────────────────────────────────────────
        validate_config(config)

        # ── 2. Resolution Layer ───────────────────────────────────────────────
        plan = resolve(config)

        # ── 3. Execution Layer ────────────────────────────────────────────────
        blackboard = Blackboard(
            input_data=config.input or {},
            orchestration_id=config.orchestration_id,
        )

        status, n_exec, n_fail, n_compact = await run_dag(
            plan, blackboard, emitter, config, hitl_gate
        )

        total_tok = blackboard.total_tokens
        await emitter.orchestration_complete(
            status=status,
            total_token_usage={
                "prompt_tokens":     0,
                "completion_tokens": total_tok,
                "total_tokens":      total_tok,
            },
            total_duration_ms=_elapsed_ms(),
            nodes_executed=n_exec,
            nodes_failed=n_fail,
            compaction_events=n_compact,
        )

    except DefinitionError as exc:
        await emitter.error("__definition__", "validation_error", str(exc), "fail")
        await emitter.orchestration_complete(
            "failure", {"total_tokens": 0}, _elapsed_ms(), 0, 1, 0
        )

    except ResolutionError as exc:
        await emitter.error("__resolution__", "validation_error", str(exc), "fail")
        await emitter.orchestration_complete(
            "failure", {"total_tokens": 0}, _elapsed_ms(), 0, 1, 0
        )

    except Exception as exc:
        await emitter.error("__orchestration__", "agent_error", str(exc), "fail")
        await emitter.orchestration_complete(
            "failure", {"total_tokens": 0}, _elapsed_ms(), 0, 1, 0
        )

    finally:
        await log_queue.put({"type": "done", "message": "stream_end"})
