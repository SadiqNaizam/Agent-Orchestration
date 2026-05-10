"""
Execution Layer — DAG executor, agent execution via LiteLLM,
error-policy handler, and compaction engine.

Design decisions
────────────────
  - Fully async: no thread-pool executors; LiteLLM's async API is used directly.
  - Credentials are passed per-call (not via global env vars) when supplied.
  - Token counts fall back to a 4-chars-per-token approximation when the
    provider does not return usage in streaming chunks.
  - The compaction engine is non-fatal: a failed compaction emits an error
    event and execution continues.
  - A hard 200-step cap prevents runaway loops.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import litellm

from blackboard import Blackboard
from models import (
    CompactionConfig, NodeConfig, NodeErrorPolicy, OrchestrationConfig,
)
from streaming import StreamingEmitter
from layers.resolution import ExecutionPlan


# ── Credential helper ─────────────────────────────────────────────────────────

class _Creds:
    def __init__(self, config: OrchestrationConfig) -> None:
        self.api_key        = config.api_key
        self.api_key_type   = (config.api_key_type or "openai").lower()
        self.azure_endpoint = config.azure_endpoint
        self.azure_version  = config.azure_api_version or "2024-02-01"

    def for_provider(self, provider: str) -> dict:
        """Return extra kwargs for litellm.acompletion() based on credentials."""
        if not self.api_key:
            return {}  # rely on environment variables
        kw: dict = {"api_key": self.api_key}
        if provider == "azure" or self.api_key_type == "azure":
            if self.azure_endpoint:
                kw["api_base"] = self.azure_endpoint
            kw["api_version"] = self.azure_version
        return kw


# ── DAG executor ──────────────────────────────────────────────────────────────

async def run_dag(
    plan: ExecutionPlan,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    config: OrchestrationConfig,
) -> Tuple[str, int, int, int]:
    """
    Walk the graph from __start__ to __end__, executing nodes along the way.

    Returns (status, nodes_executed, nodes_failed, compaction_events).
    status is "success", "partial", or "failure".
    """
    creds       = _Creds(config)
    chunk_size  = config.streaming.chunk_size_chars if config.streaming else 500
    global_ep   = config.error_policy

    nodes_executed  = 0
    nodes_failed    = 0
    compaction_evts = 0

    current   = "__start__"
    loop_iters: Dict[str, int] = {}   # loop_id → iteration count
    step      = 0
    MAX_STEPS = 200

    while current != "__end__" and step < MAX_STEPS:
        step += 1
        outgoing = plan.adjacency.get(current, [])

        if not outgoing:
            break

        # ── Select next edge ──────────────────────────────────────────────────
        next_edge = _pick_edge(outgoing, blackboard)
        if next_edge is None:
            next_edge = next((e for e in outgoing if e.default), None)
        if next_edge is None:
            break

        next_id = next_edge.to_node

        # Emit routing_decision (skip for __start__ → first node)
        if current != "__start__":
            rtype = (
                "default"        if next_edge.default else
                "deterministic"  if next_edge.condition and
                                    next_edge.condition.type == "deterministic"
                else "unconditional"
            )
            await emitter.routing_decision(
                current, rtype, next_id,
                condition_expression=(
                    next_edge.condition.expression if next_edge.condition else None
                ),
            )

        if next_id == "__end__":
            break

        node = plan.nodes.get(next_id)
        if node is None:
            break

        # ── Loop handling ────────────────────────────────────────────────────
        if next_edge.loop:
            lp    = next_edge.loop
            count = loop_iters.get(lp.loop_id, 0)
            exit_met = (
                count > 0 and blackboard.evaluate_condition(lp.exit_condition)
            ) or count >= lp.max_iterations

            await emitter.loop_iteration(
                next_id, lp.loop_id,
                count + 1, lp.max_iterations, exit_met,
            )

            if exit_met:
                current = next_id
                continue

            loop_iters[lp.loop_id] = count + 1

        # ── Pre-execution compaction check ───────────────────────────────────
        if config.compaction and config.compaction.enabled:
            did = await _maybe_compact(
                config.compaction, blackboard, emitter, creds, chunk_size
            )
            if did:
                compaction_evts += 1

        # ── Execute node ─────────────────────────────────────────────────────
        policy  = _effective_policy(node, global_ep)
        success = await _execute_with_policy(
            node, blackboard, emitter, policy, creds, chunk_size
        )
        blackboard.increment_step()

        if success:
            nodes_executed += 1
        else:
            nodes_failed += 1
            if policy.policy == "fail":
                return "failure", nodes_executed, nodes_failed, compaction_evts
            elif policy.policy == "skip":
                blackboard.write(f"{node.node_id}.output", None)

        current = next_id

    status = "success" if nodes_failed == 0 else "partial"
    return status, nodes_executed, nodes_failed, compaction_evts


# ── Edge selection ────────────────────────────────────────────────────────────

def _pick_edge(edges: List, blackboard: Blackboard) -> Optional[object]:
    """Return the first non-default edge whose condition (if any) is satisfied."""
    for edge in edges:
        if edge.default:
            continue
        if edge.condition is None:
            return edge
        if edge.condition.type == "deterministic" and edge.condition.expression:
            try:
                if blackboard.evaluate_condition(edge.condition.expression):
                    return edge
            except Exception:
                pass
    return None


# ── Error policy ──────────────────────────────────────────────────────────────

def _effective_policy(node: NodeConfig, global_ep) -> NodeErrorPolicy:
    if node.error_policy:
        return node.error_policy
    if global_ep:
        per = (global_ep.per_node or {}).get(node.node_id)
        if per:
            return per
        return NodeErrorPolicy(policy=global_ep.default)
    return NodeErrorPolicy(policy="fail")


async def _execute_with_policy(
    node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    policy: NodeErrorPolicy,
    creds: _Creds,
    chunk_size: int,
) -> bool:
    max_attempts = policy.max_attempts if policy.policy == "retry" else 1

    for attempt in range(max_attempts):
        try:
            await _run_agent(node, blackboard, emitter, creds, chunk_size)
            return True
        except Exception as exc:
            is_last   = attempt == max_attempts - 1
            applied   = policy.policy if is_last else "retry"
            await emitter.error(
                node.node_id, "agent_error", str(exc), applied, attempt + 1
            )
            if not is_last:
                await asyncio.sleep(_backoff(policy, attempt))

    return False


def _backoff(policy: NodeErrorPolicy, attempt: int) -> float:
    b = policy.backoff_base_seconds
    if policy.backoff == "linear":       return b * (attempt + 1)
    if policy.backoff == "exponential":  return b * (2 ** attempt)
    return b


# ── Agent execution ───────────────────────────────────────────────────────────

async def _run_agent(
    node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    creds: _Creds,
    chunk_size: int,
) -> None:
    agent = node.agent

    # ── Resolve input ────────────────────────────────────────────────────────
    if node.context_mode == "shared":
        input_data = blackboard.get_agent_visible()
        input_keys = list(input_data.keys())
    else:
        input_data, input_keys = {}, []
        for local_key, jsonpath in node.input_mapping.items():
            val = blackboard.resolve_jsonpath(jsonpath)
            input_data[local_key] = val
            input_keys.append(local_key)

    await emitter.node_start(
        node.node_id, agent.agent_id, input_keys, node.context_mode
    )
    t0 = time.time()

    # ── Build messages ───────────────────────────────────────────────────────
    user_content = agent.instructions
    if input_data:
        user_content += f"\n\nInput:\n{json.dumps(input_data, indent=2, default=str)}"

    messages = [
        {"role": "system", "content": agent.system_prompt},
        {"role": "user",   "content": user_content},
    ]

    # ── Build LiteLLM kwargs ─────────────────────────────────────────────────
    model_str = f"{agent.model.provider}/{agent.model.model_name}"
    call_kw: dict = {"model": model_str, "messages": messages, "stream": True}
    if agent.model.temperature is not None:
        call_kw["temperature"] = agent.model.temperature
    if agent.model.max_tokens is not None:
        call_kw["max_tokens"] = agent.model.max_tokens
    if agent.model.top_p is not None:
        call_kw["top_p"] = agent.model.top_p
    call_kw.update(creds.for_provider(agent.model.provider))

    # ── Stream response ──────────────────────────────────────────────────────
    full_content  = ""
    buf           = ""
    chunk_index   = 0
    usage: dict   = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    response = await litellm.acompletion(**call_kw)

    async for chunk in response:
        delta = (chunk.choices[0].delta.content or "") if chunk.choices else ""
        full_content += delta
        buf          += delta

        if hasattr(chunk, "usage") and chunk.usage:
            u = chunk.usage
            usage["prompt_tokens"]     = getattr(u, "prompt_tokens",     0) or 0
            usage["completion_tokens"] = getattr(u, "completion_tokens", 0) or 0
            usage["total_tokens"]      = getattr(u, "total_tokens",      0) or 0

        if len(buf) >= chunk_size:
            await emitter.chunk(node.node_id, buf, chunk_index)
            buf, chunk_index = "", chunk_index + 1

    if buf:
        await emitter.chunk(node.node_id, buf, chunk_index, is_final=True)

    # Approximate usage if provider didn't return it
    if usage["total_tokens"] == 0 and full_content:
        approx = max(1, len(full_content) // 4)
        usage["completion_tokens"] = approx
        usage["total_tokens"]      = approx

    duration_ms = int((time.time() - t0) * 1000)

    # ── Write to blackboard ──────────────────────────────────────────────────
    output = {"content": full_content}
    out_key = f"{node.node_id}.output"
    blackboard.write(out_key, output)
    out_keys = [out_key]

    for bb_key in node.output_mapping:
        blackboard.write(bb_key, output)
        if bb_key not in out_keys:
            out_keys.append(bb_key)

    blackboard.write(f"{node.node_id}.metadata", {
        "token_usage":   usage,
        "duration_ms":   duration_ms,
        "completed_at":  datetime.now(timezone.utc).isoformat(),
    })
    blackboard.add_tokens(usage["total_tokens"])

    await emitter.node_complete(node.node_id, out_keys, usage, duration_ms)


# ── Compaction engine ─────────────────────────────────────────────────────────

async def _maybe_compact(
    cfg: CompactionConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    creds: _Creds,
    chunk_size: int,
) -> bool:
    """Trigger compaction if the token threshold is exceeded. Returns True if ran."""
    if blackboard.total_tokens < cfg.token_threshold:
        return False

    all_data_keys = [
        k for k in blackboard.keys()
        if not (k.startswith("__") and k.endswith("__"))
    ]
    preserve     = set(cfg.preserve_keys)
    output_keys  = [k for k in all_data_keys if k.endswith(".output")]
    recent       = set(output_keys[-cfg.min_recency_window:])
    compactable  = [k for k in all_data_keys if k not in preserve and k not in recent]

    if not compactable:
        return False

    tokens_before = blackboard.total_tokens
    ca            = cfg.compaction_agent
    model_str     = f"{ca.model.provider}/{ca.model.model_name}"

    context_blob = {k: blackboard.read(k) for k in compactable}
    messages = [
        {"role": "system", "content": ca.system_prompt},
        {"role": "user",   "content": (
            ca.instructions
            + f"\n\nContext to compress:\n"
            + json.dumps(context_blob, indent=2, default=str)
        )},
    ]

    try:
        resp    = await litellm.acompletion(
            model=model_str, messages=messages,
            **creds.for_provider(ca.model.provider),
        )
        summary = resp.choices[0].message.content or ""

        for k in compactable:
            blackboard.write(k, None)
        blackboard.write("__compacted_context__", summary)
        blackboard.read("__compaction_history__").append({
            "timestamp":    datetime.now(timezone.utc).isoformat(),
            "tokens_before": tokens_before,
            "keys_compacted": compactable,
        })

        tokens_after = max(1, len(summary) // 4)
        await emitter.compaction_event(
            tokens_before, tokens_after, compactable, cfg.strategy
        )
    except Exception as exc:
        await emitter.error(
            "__compaction__", "compaction_error", str(exc), "skip"
        )

    return True
