"""
Execution Layer — DAG executor, agent execution via LiteLLM,
error-policy handler, compaction engine, tool use, LLM-as-router,
dynamic sub-agent spawning, output-schema validation, and provenance.

Feature status vs. spec
────────────────────────
  DAG executor          ✓
  Blackboard            ✓
  Deterministic routing ✓
  LLM-as-router         ✓  (calls router agent, validates against candidates)
  retry / fail / skip   ✓
  fallback policy       ✓  (executes fallback_node, writes error_context)
  Tool use              ✓  (multi-turn loop with litellm tools= param)
  Dynamic spawn         ✓  (spawn_agent tool; ephemeral node execution)
  Output-schema valid.  ✓  (JSON parse + required-field check)
  Provenance            ✓  (chain attached to chunk events when enabled)
  Compaction            ✓  (summarize_oldest strategy)
  Parallel team         ✗  Phase 2
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import litellm

from blackboard import Blackboard
from models import (
    AgentDefinition, CompactionConfig, HitlConfig, NodeConfig,
    NodeErrorPolicy, OrchestrationConfig,
)
from streaming import StreamingEmitter
from layers.resolution import ExecutionPlan


# ── HITL gate ─────────────────────────────────────────────────────────────────

class HitlGate:
    """Per-job pause/resume gate for Human-in-the-Loop checkpoints.

    The execution coroutine awaits ``wait()``; the HTTP handler calls ``resume()``.
    ``reset()`` prepares the gate for the *next* HITL checkpoint in the same job.
    """

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self._event: asyncio.Event = asyncio.Event()
        self.input: Optional[Dict[str, Any]] = None

    async def wait(self, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        if timeout is not None:
            try:
                await asyncio.wait_for(asyncio.shield(self._event.wait()), timeout=timeout)
            except asyncio.TimeoutError:
                return None
        else:
            await self._event.wait()
        return self.input

    def resume(self, input_data: Dict[str, Any]) -> None:
        self.input = input_data
        self._event.set()

    def reset(self) -> None:
        self._event.clear()
        self.input = None


# ── Runtime context ────────────────────────────────────────────────────────────

@dataclass
class _Ctx:
    """Passed through the entire call tree to avoid parameter proliferation."""
    config:             OrchestrationConfig
    plan:               ExecutionPlan
    creds:              _Creds
    chunk_size:         int
    provenance_enabled: bool
    node_chain:         List[str] = field(default_factory=list)   # nodes completed so far
    hitl_gate:          Optional["HitlGate"] = None

    def provenance_for(self, node_id: str) -> Optional[dict]:
        if not self.provenance_enabled:
            return None
        chain = self.node_chain + [node_id]
        return {
            "chain": chain,
            "contribution_map": {n: "content_generation" for n in chain},
        }


# ── Credential helper ─────────────────────────────────────────────────────────

class _Creds:
    def __init__(self, config: OrchestrationConfig) -> None:
        self.api_key       = config.api_key
        self.api_key_type  = (config.api_key_type or "openai").lower()
        self.azure_endpoint = config.azure_endpoint
        self.azure_version  = config.azure_api_version or "2024-02-01"

    def for_provider(self, provider: str) -> dict:
        if not self.api_key:
            return {}
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
    hitl_gate: Optional["HitlGate"] = None,
) -> Tuple[str, int, int, int]:
    """
    Walk the graph from __start__ to __end__.
    Returns (status, nodes_executed, nodes_failed, compaction_events).
    """
    ctx = _Ctx(
        config=config,
        plan=plan,
        creds=_Creds(config),
        chunk_size=config.streaming.chunk_size_chars if config.streaming else 500,
        provenance_enabled=bool(config.streaming and config.streaming.provenance_enabled),
        hitl_gate=hitl_gate,
    )

    nodes_executed  = 0
    nodes_failed    = 0
    compaction_evts = 0

    # Each edge leaving __start__ is an independent branch.
    # A plain linear graph has exactly one, so behaviour is unchanged.
    # Preset fan-out produces multiple edges; we walk each branch in sequence.
    all_start_edges = plan.adjacency.get("__start__", [])
    if not all_start_edges:
        return "success", 0, 0, 0

    for branch_start_edge in all_start_edges:

        current    = "__start__"
        loop_iters: Dict[str, int] = {}
        step       = 0
        MAX_STEPS  = 200

        while current != "__end__" and step < MAX_STEPS:
            step += 1

            # Restrict __start__ to this branch's single entry edge so that
            # concurrent preset expansions each walk their own complete path.
            if current == "__start__":
                outgoing = [branch_start_edge]
            else:
                outgoing = plan.adjacency.get(current, [])
            if not outgoing:
                break

            # ── Select next edge + target node ───────────────────────────────
            next_edge, next_id = await _select_next(outgoing, blackboard, ctx, emitter, current)
            if next_edge is None:
                break

            # Emit routing decision (skip for the very first hop)
            if current != "__start__":
                rtype = (
                    "default"       if next_edge.default else
                    "llm_router"    if next_edge.condition and next_edge.condition.type == "llm_router" else
                    "deterministic" if next_edge.condition else
                    "unconditional"
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

            # ── Loop handling ─────────────────────────────────────────────────
            if next_edge.loop:
                lp    = next_edge.loop
                count = loop_iters.get(lp.loop_id, 0)
                exit_met = (
                    count > 0 and blackboard.evaluate_condition(lp.exit_condition)
                ) or count >= lp.max_iterations
                await emitter.loop_iteration(
                    next_id, lp.loop_id, count + 1, lp.max_iterations, exit_met
                )
                if exit_met:
                    current = next_id
                    continue
                loop_iters[lp.loop_id] = count + 1

            # ── Pre-execution compaction ──────────────────────────────────────
            if config.compaction and config.compaction.enabled:
                if await _maybe_compact(config.compaction, blackboard, emitter, ctx):
                    compaction_evts += 1

            # ── Execute node ──────────────────────────────────────────────────
            policy            = _effective_policy(node, config)
            success, fallback = await _execute_with_policy(node, blackboard, emitter, policy, ctx)
            blackboard.increment_step()

            if success:
                nodes_executed += 1
                ctx.node_chain.append(next_id)
            elif fallback:
                # ── Fallback routing ──────────────────────────────────────────
                fb_node = plan.nodes.get(fallback)
                if fb_node:
                    blackboard.write("error_context", {
                        "failed_node": node.node_id,
                        "timestamp":   datetime.now(timezone.utc).isoformat(),
                    })
                    fb_policy       = _effective_policy(fb_node, config)
                    fb_ok, _        = await _execute_with_policy(
                        fb_node, blackboard, emitter, fb_policy, ctx
                    )
                    blackboard.increment_step()
                    if fb_ok:
                        nodes_executed += 1
                        ctx.node_chain.append(fallback)
                        current = fallback
                        continue
                nodes_failed += 1
                return "failure", nodes_executed, nodes_failed, compaction_evts
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

async def _select_next(
    edges: List,
    blackboard: Blackboard,
    ctx: _Ctx,
    emitter: StreamingEmitter,
    from_node: str,
) -> Tuple[Optional[object], Optional[str]]:
    """
    Return (edge, effective_node_id).
    For llm_router the node_id may differ from edge.to_node.
    Falls back to the default edge if nothing else matches.
    """
    default_edge = None

    for edge in edges:
        if edge.default:
            default_edge = edge
            continue

        if edge.condition is None:
            return edge, edge.to_node

        if edge.condition.type == "deterministic" and edge.condition.expression:
            try:
                if blackboard.evaluate_condition(edge.condition.expression):
                    return edge, edge.to_node
            except Exception:
                pass

        elif edge.condition.type == "llm_router":
            selected = await _run_llm_router(edge, from_node, blackboard, ctx, emitter)
            if selected:
                return edge, selected

    if default_edge:
        return default_edge, default_edge.to_node

    return None, None


async def _run_llm_router(
    edge,
    from_node: str,
    blackboard: Blackboard,
    ctx: _Ctx,
    emitter: StreamingEmitter,
) -> Optional[str]:
    """
    Invoke the router agent defined in edge.condition.router_agent_ref.
    Returns the selected candidate node_id, or None on failure.
    """
    cond      = edge.condition
    candidates = cond.candidates or []
    if not candidates:
        return None

    router_node = ctx.plan.nodes.get(cond.router_agent_ref or "")
    if not router_node:
        return None

    # Build context from specified blackboard keys
    context: dict = {}
    for key in (cond.routing_context_keys or []):
        val = (
            blackboard.resolve_jsonpath(key) if key.startswith("$.")
            else blackboard.read(key)
        )
        context[key] = val

    # Build candidate descriptions
    cand_lines = []
    for c in candidates:
        n = ctx.plan.nodes.get(c)
        desc = (n.agent.description or n.agent.name or "") if n else ""
        cand_lines.append(f"  - {c}: {desc}")

    ra    = router_node.agent
    model = f"{ra.model.provider}/{ra.model.model_name}"
    messages = [
        {"role": "system", "content": ra.system_prompt},
        {"role": "user",   "content": (
            ra.instructions
            + "\n\nAvailable next nodes:\n" + "\n".join(cand_lines)
            + "\n\nContext:\n" + json.dumps(context, indent=2, default=str)
            + "\n\nRespond with ONLY the node_id of your selection (one of: "
            + ", ".join(candidates) + ")."
        )},
    ]

    try:
        resp = await litellm.acompletion(
            model=model, messages=messages,
            **ctx.creds.for_provider(ra.model.provider),
        )
        raw = (resp.choices[0].message.content or "").strip()

        # Exact match
        if raw in candidates:
            await emitter.routing_decision(from_node, "llm_router", raw, reason=raw)
            return raw

        # Substring match (LLM may add punctuation)
        for c in candidates:
            if c in raw:
                await emitter.routing_decision(from_node, "llm_router", c, reason=raw)
                return c
    except Exception:
        pass

    return None


# ── Error policy ──────────────────────────────────────────────────────────────

def _effective_policy(node: NodeConfig, config: OrchestrationConfig) -> NodeErrorPolicy:
    if node.error_policy:
        return node.error_policy
    if config.error_policy:
        per = (config.error_policy.per_node or {}).get(node.node_id)
        if per:
            return per
        return NodeErrorPolicy(policy=config.error_policy.default)
    return NodeErrorPolicy(policy="fail")


async def _execute_with_policy(
    node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    policy: NodeErrorPolicy,
    ctx: _Ctx,
) -> Tuple[bool, Optional[str]]:
    """Execute node with error policy. Returns (success, fallback_node_id_or_None)."""
    max_attempts = policy.max_attempts if policy.policy == "retry" else 1

    for attempt in range(max_attempts):
        try:
            await _run_agent(node, blackboard, emitter, ctx)
            return True, None
        except Exception as exc:
            is_last = attempt == max_attempts - 1
            applied = policy.policy if is_last else "retry"
            await emitter.error(
                node.node_id, "agent_error", str(exc), applied, attempt + 1
            )
            if is_last:
                if policy.policy == "fallback" and policy.fallback_node:
                    return False, policy.fallback_node
                return False, None
            await asyncio.sleep(_backoff(policy, attempt))

    return False, None


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
    ctx: _Ctx,
) -> None:
    agent = node.agent

    # ── HITL checkpoint (fires before LLM execution) ──────────────────────────
    if node.hitl and ctx.hitl_gate:
        hitl_cfg = node.hitl
        await emitter.hitl_pause(node.node_id, hitl_cfg.prompt, ctx.hitl_gate.job_id)
        human_input = await ctx.hitl_gate.wait(
            timeout=float(hitl_cfg.timeout_seconds) if hitl_cfg.timeout_seconds else None
        )
        if human_input is not None:
            blackboard.write(f"{node.node_id}.{hitl_cfg.input_key}", human_input)
        ctx.hitl_gate.reset()
        await emitter.hitl_resume(node.node_id, hitl_cfg.input_key)

    # ── Resolve input ─────────────────────────────────────────────────────────
    if node.context_mode == "shared":
        input_data = blackboard.get_agent_visible()
        input_keys = list(input_data.keys())
    else:
        input_data, input_keys = {}, []
        for local_key, jsonpath in node.input_mapping.items():
            val = blackboard.resolve_jsonpath(jsonpath)
            input_data[local_key] = val
            input_keys.append(local_key)

    await emitter.node_start(node.node_id, agent.agent_id, input_keys, node.context_mode)
    t0 = time.time()

    # ── Build initial messages ────────────────────────────────────────────────
    user_content = agent.instructions
    if input_data:
        user_content += f"\n\nInput:\n{json.dumps(input_data, indent=2, default=str)}"

    messages: List[dict] = [
        {"role": "system", "content": agent.system_prompt},
        {"role": "user",   "content": user_content},
    ]

    call_kw = _base_call_kwargs(agent, ctx.creds)

    # ── Execute: tool-use mode or simple streaming ────────────────────────────
    if agent.tools:
        full_content, usage = await _run_with_tools(
            agent, messages, call_kw, node, blackboard, emitter, ctx
        )
    else:
        full_content, usage = await _run_streaming(
            messages, call_kw, node.node_id, emitter, ctx
        )

    # ── Output-schema validation ──────────────────────────────────────────────
    output = {"content": full_content}
    if agent.output_schema:
        parsed = _try_parse_json(full_content)
        if parsed is not None:
            errors = _validate_schema(parsed, agent.output_schema)
            output["parsed"] = parsed
            if errors:
                output["schema_errors"] = errors
        else:
            output["schema_errors"] = ["Response is not valid JSON"]

    duration_ms = int((time.time() - t0) * 1000)

    # ── Write to blackboard ───────────────────────────────────────────────────
    out_key = f"{node.node_id}.output"
    # Preserve routing signals (next_agent, signal) that tool execution may have
    # already written — do not overwrite them with the plain content dict.
    existing = blackboard.read(out_key)
    if isinstance(existing, dict):
        for sig_key in ("signal", "next_agent"):
            if sig_key in existing:
                output[sig_key] = existing[sig_key]
    blackboard.write(out_key, output)
    out_keys = [out_key]
    for bb_key in node.output_mapping:
        blackboard.write(bb_key, output)
        if bb_key not in out_keys:
            out_keys.append(bb_key)

    blackboard.write(f"{node.node_id}.metadata", {
        "token_usage":  usage,
        "duration_ms":  duration_ms,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    blackboard.add_tokens(usage.get("total_tokens", 0))

    await emitter.node_complete(node.node_id, out_keys, usage, duration_ms)


def _base_call_kwargs(agent: AgentDefinition, creds: _Creds) -> dict:
    kw: dict = {"model": f"{agent.model.provider}/{agent.model.model_name}"}
    if agent.model.temperature is not None:
        kw["temperature"] = agent.model.temperature
    if agent.model.max_tokens is not None:
        kw["max_tokens"] = agent.model.max_tokens
    if agent.model.top_p is not None:
        kw["top_p"] = agent.model.top_p
    kw.update(creds.for_provider(agent.model.provider))
    return kw


# ── Simple streaming execution ────────────────────────────────────────────────

async def _run_streaming(
    messages: List[dict],
    call_kw: dict,
    node_id: str,
    emitter: StreamingEmitter,
    ctx: _Ctx,
) -> Tuple[str, dict]:
    full_content = ""
    buf          = ""
    chunk_index  = 0
    usage: dict  = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    response = await litellm.acompletion(**call_kw, messages=messages, stream=True)

    async for chunk in response:
        delta = (chunk.choices[0].delta.content or "") if chunk.choices else ""
        full_content += delta
        buf          += delta

        if hasattr(chunk, "usage") and chunk.usage:
            u = chunk.usage
            usage["prompt_tokens"]     = getattr(u, "prompt_tokens",     0) or 0
            usage["completion_tokens"] = getattr(u, "completion_tokens", 0) or 0
            usage["total_tokens"]      = getattr(u, "total_tokens",      0) or 0

        if len(buf) >= ctx.chunk_size:
            await emitter.chunk(
                node_id, buf, chunk_index,
                provenance=ctx.provenance_for(node_id),
            )
            buf, chunk_index = "", chunk_index + 1

    if buf:
        await emitter.chunk(
            node_id, buf, chunk_index, is_final=True,
            provenance=ctx.provenance_for(node_id),
        )

    if not usage["total_tokens"] and full_content:
        approx = max(1, len(full_content) // 4)
        usage["completion_tokens"] = approx
        usage["total_tokens"]      = approx

    return full_content, usage


# ── Tool-use multi-turn execution ─────────────────────────────────────────────

async def _run_with_tools(
    agent: AgentDefinition,
    messages: List[dict],
    call_kw: dict,
    node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    ctx: _Ctx,
) -> Tuple[str, dict]:
    """
    Multi-turn tool loop.
    Continues until the LLM produces content without tool_calls (max 10 rounds).
    """
    litellm_tools = [
        {"type": t.get("type", "function"), "function": t["function"]}
        for t in agent.tools
    ]

    total_usage  = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    full_content = ""
    msgs         = list(messages)

    for _ in range(10):
        resp = await litellm.acompletion(
            **call_kw, messages=msgs, tools=litellm_tools, stream=False
        )
        msg = resp.choices[0].message

        if resp.usage:
            total_usage["prompt_tokens"]     += resp.usage.prompt_tokens     or 0
            total_usage["completion_tokens"] += resp.usage.completion_tokens or 0
            total_usage["total_tokens"]      += resp.usage.total_tokens      or 0

        # Build assistant turn (include tool_calls if any)
        asst: dict = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            asst["tool_calls"] = [
                {
                    "id":       tc.id,
                    "type":     "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        msgs.append(asst)

        if not msg.tool_calls:
            full_content = msg.content or ""
            # Emit as chunks
            await _emit_chunks(node.node_id, full_content, emitter, ctx)
            break

        # Execute each tool call
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            result = await _execute_tool(
                tc.function.name, args, node, blackboard, emitter, ctx
            )

            # If final_response tool was called, signal completion
            if tc.function.name == "final_response":
                full_content = args.get("response", "")
                await _emit_chunks(node.node_id, full_content, emitter, ctx)
                # Write signal to output so exit condition can be detected
                blackboard.write(f"{node.node_id}.output", {
                    "content": full_content,
                    "signal":  "final_response",
                })
                goto_end = True
            else:
                goto_end = False

            msgs.append({
                "role":         "tool",
                "tool_call_id": tc.id,
                "content":      json.dumps(result, default=str),
            })

            # After route_to_sub_agent, write routing signal and exit the loop so
            # the DAG can immediately route to the sub-agent without an extra LLM
            # round-trip that would hallucinate "I have delegated..." and overwrite
            # the signal on the next blackboard write in _run_agent.
            if tc.function.name == "route_to_sub_agent":
                selected = args.get("agent_id")
                if selected:
                    out_so_far = blackboard.read(f"{node.node_id}.output") or {}
                    out_so_far["next_agent"] = selected
                    blackboard.write(f"{node.node_id}.output", out_so_far)
                full_content = args.get("reason", f"Routing to {selected}")
                goto_end = True

        if goto_end:
            break

    if not total_usage["total_tokens"] and full_content:
        approx = max(1, len(full_content) // 4)
        total_usage["completion_tokens"] = approx
        total_usage["total_tokens"]      = approx

    return full_content, total_usage


async def _emit_chunks(
    node_id: str, content: str, emitter: StreamingEmitter, ctx: _Ctx
) -> None:
    """Break content into configured chunk sizes and emit."""
    if not content:
        await emitter.chunk(node_id, "", 0, is_final=True,
                            provenance=ctx.provenance_for(node_id))
        return
    i = 0
    for start in range(0, len(content), ctx.chunk_size):
        piece = content[start: start + ctx.chunk_size]
        is_final = (start + ctx.chunk_size) >= len(content)
        await emitter.chunk(node_id, piece, i, is_final=is_final,
                            provenance=ctx.provenance_for(node_id))
        i += 1


# ── Tool execution ────────────────────────────────────────────────────────────

async def _execute_tool(
    tool_name: str,
    args: dict,
    node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    ctx: _Ctx,
) -> Any:
    """Dispatch a tool call. Returns the tool result dict."""

    if tool_name == "spawn_agent":
        return await _spawn_agent(args, node, blackboard, emitter, ctx)

    if tool_name == "route_to_sub_agent":
        # Handled at call-site (writes next_agent to output); return ack
        selected = args.get("agent_id", "")
        return {"status": "routing", "next_agent": selected,
                "reason": args.get("reason", "")}

    if tool_name == "final_response":
        return {"status": "complete", "response": args.get("response", "")}

    # Unknown tool — surface in output but don't crash
    return {"error": f"Tool '{tool_name}' is not registered", "tool_name": tool_name}


async def _spawn_agent(
    args: dict,
    parent_node: NodeConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    ctx: _Ctx,
) -> dict:
    """Execute a spawnable agent and return its output."""
    agent_id   = args.get("agent_id", "")
    input_data = args.get("input", {})

    spawnable = ctx.plan.spawnable_agents.get(agent_id)
    if not spawnable:
        return {"error": f"'{agent_id}' is not in the spawnable_agents pool"}

    # Build ephemeral node
    spawn_node_id = f"__spawned__{agent_id}"
    spawn_input_key = f"__spawn_input__{agent_id}_{int(time.time()*1000)}"
    blackboard.write(spawn_input_key, input_data)

    temp_node = NodeConfig(
        node_id=spawn_node_id,
        agent=spawnable,
        context_mode="scoped",
        input_mapping={"input": f"$.{spawn_input_key}"},
    )

    try:
        await _run_agent(temp_node, blackboard, emitter, ctx)
        output = blackboard.read(f"{spawn_node_id}.output") or {}

        # Persist into __spawned__ namespace
        ts_key = f"{agent_id}.{int(time.time()*1000)}"
        spawned_store = blackboard.read("__spawned__") or {}
        spawned_store[ts_key] = output
        blackboard.write("__spawned__", spawned_store)

        return {"output": output, "agent_id": agent_id, "status": "success"}
    except Exception as exc:
        return {"error": str(exc), "agent_id": agent_id, "status": "failed"}


# ── Output schema validation ──────────────────────────────────────────────────

def _try_parse_json(text: str) -> Optional[Any]:
    """Try to parse text as JSON; extract first JSON object/array if embedded."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to extract first { } block
    start = text.find("{")
    if start != -1:
        # Find matching closing brace
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i+1])
                    except json.JSONDecodeError:
                        break
    return None


def _validate_schema(data: Any, schema: dict) -> List[str]:
    """Minimal JSON schema validation: checks type and required fields only."""
    errors: List[str] = []
    expected_type = schema.get("type")

    if expected_type == "object" and not isinstance(data, dict):
        errors.append(f"Expected object, got {type(data).__name__}")
        return errors

    if expected_type == "array" and not isinstance(data, list):
        errors.append(f"Expected array, got {type(data).__name__}")
        return errors

    if expected_type == "object" and isinstance(data, dict):
        for req in schema.get("required", []):
            if req not in data:
                errors.append(f"Missing required field: '{req}'")

    return errors


# ── Compaction engine ─────────────────────────────────────────────────────────

async def _maybe_compact(
    cfg: CompactionConfig,
    blackboard: Blackboard,
    emitter: StreamingEmitter,
    ctx: _Ctx,
) -> bool:
    if blackboard.total_tokens < cfg.token_threshold:
        return False

    all_data_keys = [
        k for k in blackboard.keys()
        if not (k.startswith("__") and k.endswith("__"))
    ]
    preserve    = set(cfg.preserve_keys)
    output_keys = [k for k in all_data_keys if k.endswith(".output")]
    recent      = set(output_keys[-cfg.min_recency_window:])
    compactable = [k for k in all_data_keys if k not in preserve and k not in recent]

    if not compactable:
        return False

    tokens_before = blackboard.total_tokens
    ca            = cfg.compaction_agent
    model_str     = f"{ca.model.provider}/{ca.model.model_name}"
    context_blob  = {k: blackboard.read(k) for k in compactable}

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
            **ctx.creds.for_provider(ca.model.provider),
        )
        summary = resp.choices[0].message.content or ""

        for k in compactable:
            blackboard.write(k, None)
        blackboard.write("__compacted_context__", summary)
        blackboard.read("__compaction_history__").append({
            "timestamp":      datetime.now(timezone.utc).isoformat(),
            "tokens_before":  tokens_before,
            "keys_compacted": compactable,
        })

        tokens_after = max(1, len(summary) // 4)
        await emitter.compaction_event(
            tokens_before, tokens_after, compactable, cfg.strategy
        )
    except Exception as exc:
        await emitter.error("__compaction__", "compaction_error", str(exc), "skip")

    return True
