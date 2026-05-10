"""
StreamingEmitter — puts structured event envelopes into the asyncio queue
that feeds the SSE endpoint.  All public methods are coroutines.

Envelope format (matches the architecture spec):
{
  "type": "event",
  "data": {
    "orchestration_id": str,
    "sequence":         int (monotonically increasing),
    "timestamp":        ISO-8601 string,
    "event_type":       "node_start" | "chunk" | "node_complete" |
                        "routing_decision" | "loop_iteration" |
                        "compaction_event" | "error" | "orchestration_complete",
    "node_id":          str | null,
    "node_type":        "agent" | "tool" | "component" | "merge" |
                        "spawned_agent" | "system" | null,
    "payload":          dict,
    "provenance":       null  (Phase 1: always null)
  }
}

The terminal sentinel is {"type": "done", "message": "stream_end"}.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional


class StreamingEmitter:
    def __init__(self, orchestration_id: str, queue: asyncio.Queue) -> None:
        self.orchestration_id = orchestration_id
        self._queue = queue
        self._seq = 0

    # ── Internal ───────────────────────────────────────────────────────────────

    def _next(self) -> int:
        self._seq += 1
        return self._seq

    async def _emit(
        self,
        event_type: str,
        payload: dict,
        node_id: Optional[str] = None,
        node_type: Optional[str] = None,
    ) -> None:
        await self._queue.put({
            "type": "event",
            "data": {
                "orchestration_id": self.orchestration_id,
                "sequence": self._next(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": event_type,
                "node_id": node_id,
                "node_type": node_type,
                "payload": payload,
                "provenance": None,
            },
        })

    # ── Public API ─────────────────────────────────────────────────────────────

    async def node_start(
        self, node_id: str, agent_id: str, input_keys: list, context_mode: str
    ) -> None:
        await self._emit(
            "node_start",
            {"agent_id": agent_id, "input_keys": input_keys, "context_mode": context_mode},
            node_id=node_id,
            node_type="agent",
        )

    async def chunk(
        self, node_id: str, content: str, chunk_index: int, is_final: bool = False
    ) -> None:
        await self._emit(
            "chunk",
            {"content": content, "chunk_index": chunk_index, "is_final_chunk": is_final},
            node_id=node_id,
            node_type="agent",
        )

    async def node_complete(
        self, node_id: str, output_keys: list, token_usage: dict, duration_ms: int
    ) -> None:
        await self._emit(
            "node_complete",
            {"output_keys": output_keys, "token_usage": token_usage, "duration_ms": duration_ms},
            node_id=node_id,
            node_type="agent",
        )

    async def routing_decision(
        self,
        from_node: str,
        routing_type: str,
        selected_node: str,
        condition_expression: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> None:
        await self._emit(
            "routing_decision",
            {
                "routing_type": routing_type,
                "condition_expression": condition_expression,
                "selected_node": selected_node,
                "reason": reason,
            },
            node_id=from_node,
            node_type="system",
        )

    async def loop_iteration(
        self,
        node_id: str,
        loop_id: str,
        iteration: int,
        max_iterations: int,
        exit_condition_met: bool,
    ) -> None:
        await self._emit(
            "loop_iteration",
            {
                "loop_id": loop_id,
                "iteration": iteration,
                "max_iterations": max_iterations,
                "exit_condition_met": exit_condition_met,
            },
            node_id=node_id,
            node_type="system",
        )

    async def compaction_event(
        self,
        tokens_before: int,
        tokens_after: int,
        keys_compacted: list,
        strategy: str,
    ) -> None:
        await self._emit(
            "compaction_event",
            {
                "tokens_before": tokens_before,
                "tokens_after": tokens_after,
                "keys_compacted": keys_compacted,
                "strategy": strategy,
            },
            node_type="system",
        )

    async def error(
        self,
        node_id: str,
        error_type: str,
        message: str,
        policy_applied: str,
        attempt_number: Optional[int] = None,
    ) -> None:
        await self._emit(
            "error",
            {
                "error_type": error_type,
                "message": message,
                "policy_applied": policy_applied,
                "attempt_number": attempt_number,
            },
            node_id=node_id,
            node_type="system",
        )

    async def orchestration_complete(
        self,
        status: str,
        total_token_usage: dict,
        total_duration_ms: int,
        nodes_executed: int,
        nodes_failed: int,
        compaction_events: int,
    ) -> None:
        await self._emit(
            "orchestration_complete",
            {
                "status": status,
                "total_token_usage": total_token_usage,
                "total_duration_ms": total_duration_ms,
                "nodes_executed": nodes_executed,
                "nodes_failed": nodes_failed,
                "compaction_events": compaction_events,
            },
            node_type="system",
        )
