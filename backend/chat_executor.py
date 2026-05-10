"""
Chat executor — drives a single conversational turn for a ChatSession.

Flow per turn
─────────────
  1. Append user message to session.messages
  2. Run cross-turn compaction if enabled and threshold is exceeded
  3. Build full messages list: [system] + session.messages
  4. Call LiteLLM with stream=True and emit chunk events
  5. Append assistant reply to session.messages
  6. Put the SSE done sentinel

The SSE job_id and queue are the same mechanism used by the DAG executor,
so the frontend reuses GET /api/stream/{job_id} unchanged.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import litellm

from models import ChatSession, CompactionConfig
from streaming import StreamingEmitter

_CHUNK_SIZE = 200   # chars per SSE chunk event


# ── Credential helper (mirrors execution._Creds) ──────────────────────────────

class _Creds:
    def __init__(self, session: ChatSession) -> None:
        self.api_key        = session.api_key
        self.api_key_type   = (session.api_key_type or "openai").lower()
        self.azure_endpoint = session.azure_endpoint
        self.azure_version  = session.azure_api_version or "2024-02-01"

    def for_provider(self, provider: str) -> dict:
        if not self.api_key:
            return {}
        kw: dict = {"api_key": self.api_key}
        if provider == "azure" or self.api_key_type == "azure":
            if self.azure_endpoint:
                kw["api_base"] = self.azure_endpoint
            kw["api_version"] = self.azure_version
        return kw


# ── Public entry point ────────────────────────────────────────────────────────

async def run_chat_turn(
    session: ChatSession,
    user_message: str,
    queue: Any,          # asyncio.Queue
) -> None:
    import asyncio
    node_id = f"chat-{session.session_id[:8]}"
    emitter = StreamingEmitter(f"chat-{session.session_id[:8]}", queue)
    creds   = _Creds(session)
    agent   = session.agent
    t0      = time.time()

    try:
        # 1. Append user turn
        session.messages.append({"role": "user", "content": user_message})

        await emitter.node_start(node_id, agent.agent_id, ["user_message"], "shared")

        # 2. Maybe compact before calling the LLM
        if session.compaction and session.compaction.enabled:
            await _maybe_compact(session, emitter, creds)

        # 3. Build message list for LiteLLM
        system_content = agent.system_prompt
        if agent.instructions:
            system_content += f"\n\n{agent.instructions}"

        llm_messages: List[dict] = [
            {"role": "system", "content": system_content},
            *session.messages,
        ]

        # 4. Build call kwargs
        model_str = f"{agent.model.provider}/{agent.model.model_name}"
        call_kw: dict = {"model": model_str}
        if agent.model.temperature is not None:
            call_kw["temperature"] = agent.model.temperature
        if agent.model.max_tokens is not None:
            call_kw["max_tokens"] = agent.model.max_tokens
        if agent.model.top_p is not None:
            call_kw["top_p"] = agent.model.top_p
        call_kw.update(creds.for_provider(agent.model.provider))

        # 5. Stream
        full_content, usage = await _stream_response(
            llm_messages, call_kw, node_id, emitter
        )

        # 6. Append assistant turn
        session.messages.append({"role": "assistant", "content": full_content})

        # Update approximate token count
        approx = max(1, len(full_content) // 4)
        usage.setdefault("total_tokens", approx)
        session.total_tokens += usage["total_tokens"]

        duration_ms = int((time.time() - t0) * 1000)
        await emitter.node_complete(
            node_id,
            ["assistant_message"],
            usage,
            duration_ms,
        )

    except Exception as exc:
        await emitter.error(node_id, "agent_error", str(exc), "fail")

    finally:
        await queue.put({"type": "done", "message": "stream_end"})


# ── Streaming helper ──────────────────────────────────────────────────────────

async def _stream_response(
    messages: List[dict],
    call_kw: dict,
    node_id: str,
    emitter: StreamingEmitter,
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

        if len(buf) >= _CHUNK_SIZE:
            await emitter.chunk(node_id, buf, chunk_index)
            buf, chunk_index = "", chunk_index + 1

    if buf:
        await emitter.chunk(node_id, buf, chunk_index, is_final=True)

    if not usage["total_tokens"] and full_content:
        approx = max(1, len(full_content) // 4)
        usage["completion_tokens"] = approx
        usage["total_tokens"]      = approx

    return full_content, usage


# ── Cross-turn compaction ─────────────────────────────────────────────────────

async def _maybe_compact(
    session: ChatSession,
    emitter: StreamingEmitter,
    creds: _Creds,
) -> None:
    """
    Summarise oldest conversation turns when the estimated token count
    exceeds the threshold, preserving the last min_recency_window pairs.
    """
    cfg = session.compaction
    if not cfg or not cfg.enabled:
        return

    # Estimate tokens from message text (chars / 4)
    total_chars = sum(len(m.get("content", "")) for m in session.messages)
    estimated_tokens = total_chars // 4

    if estimated_tokens < cfg.token_threshold:
        return

    # How many messages to keep (user+assistant = 2 per pair)
    keep_count = cfg.min_recency_window * 2
    # Also skip compaction summary messages injected by earlier compactions
    user_asst = [
        m for m in session.messages
        if m.get("role") in ("user", "assistant")
    ]

    if len(user_asst) <= keep_count:
        return   # not enough history to compact

    to_compact  = user_asst[:-keep_count]
    to_keep     = user_asst[-keep_count:]

    summary = await _summarise(to_compact, cfg, creds)

    # Replace session.messages: summary header + kept turns
    summary_msg = {
        "role":    "system",
        "content": f"[Earlier conversation summary]: {summary}",
    }
    session.messages = [summary_msg] + to_keep

    tokens_after = sum(len(m.get("content", "")) for m in session.messages) // 4

    node_id = f"chat-{session.session_id[:8]}"
    await emitter.compaction_event(
        estimated_tokens,
        tokens_after,
        [f"messages[0:{len(to_compact)}]"],
        cfg.strategy,
    )


async def _summarise(
    messages: List[dict],
    cfg: CompactionConfig,
    creds: _Creds,
) -> str:
    """Call the compaction agent to summarise a list of conversation turns."""
    ca = cfg.compaction_agent
    if not ca:
        # No agent configured — produce a simple concatenated summary
        return " | ".join(
            f"{m['role']}: {m['content'][:120]}" for m in messages
        )

    conversation_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )
    model_str = f"{ca.model.provider}/{ca.model.model_name}"
    summary_messages = [
        {"role": "system", "content": ca.system_prompt},
        {"role": "user",   "content": (
            ca.instructions
            + f"\n\nConversation to summarise:\n{conversation_text}"
        )},
    ]

    try:
        resp = await litellm.acompletion(
            model=model_str,
            messages=summary_messages,
            **creds.for_provider(ca.model.provider),
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        return f"[Compaction failed: {exc}] — {len(messages)} messages omitted."
