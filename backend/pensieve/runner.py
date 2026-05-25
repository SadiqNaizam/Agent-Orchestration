"""
PensieveRunner — the core execution engine for process-driven orchestration.

The runner manages a single process run:
  1. Initialises the artifact store and process state from process.md
  2. Maintains a conversation history for the main agent
  3. Handles incoming user messages by running a multi-turn LLM loop
  4. Dispatches tool calls to sub-agents (via LiteLLM) or backend ops (pure Python)
  5. Emits SSE events through an asyncio.Queue

Event types emitted
───────────────────
  chat_chunk      — streaming text token from the main agent
  chat_done       — main agent finished its response turn
  artifact_update — new artifact written (triggers left-panel template render)
  state_update    — process state changed (step complete, navigation, etc.)
  gate            — execution paused, awaiting user approval/selection
  process_complete — all steps done
  error           — tool or LLM failure
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import litellm

from pensieve.artifact_store import ArtifactStore
from pensieve.process_parser import ProcessDefinition, StepInstructions
from pensieve.process_state import ProcessRunState
from pensieve.tool_registry import TOOL_REGISTRY, get as get_tool

logger = logging.getLogger("pensieve.runner")


# ── SSE envelope helpers ───────────────────────────────────────────────────────

def _evt(event_type: str, payload: dict, run_id: str) -> dict:
    return {
        "type": "event",
        "data": {
            "orchestration_id": run_id,
            "event_type":       event_type,
            "timestamp":        datetime.now(timezone.utc).isoformat(),
            "payload":          payload,
        },
    }


# ── Backend operation tool names ───────────────────────────────────────────────
# These are handled by the runner directly — never forwarded to an LLM.

_BACKEND_OPS = {
    "read_artifact",
    "write_artifact",
    "mark_step_complete",
    "mark_artifact_stale",
    "navigate_to_step",
    "emit_artifact_to_ui",
    "request_approval",
    "get_process_state",
}


# ── Runner ─────────────────────────────────────────────────────────────────────

class PensieveRunner:
    """
    Manages one process run end-to-end.

    Create via PensieveRunner.create(), then call send_message() for each
    user turn.  The SSE queue receives all events.
    """

    def __init__(
        self,
        process_def: ProcessDefinition,
        state: ProcessRunState,
        artifact_store: ArtifactStore,
        queue: asyncio.Queue,
        model: str,
        api_key: Optional[str],
        api_key_type: str = "openai",
        azure_endpoint: Optional[str] = None,
        azure_api_version: Optional[str] = None,
    ) -> None:
        self.process_def    = process_def
        self.state          = state
        self.artifacts      = artifact_store
        self.queue          = queue
        self.model          = model
        self.api_key        = api_key
        self.api_key_type   = api_key_type
        self.azure_endpoint  = azure_endpoint
        self.azure_api_version = azure_api_version
        self.conversation:  List[Dict] = []
        self._lock          = asyncio.Lock()

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        process_def: ProcessDefinition,
        run_id: str,
        queue: asyncio.Queue,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        api_key_type: str = "openai",
        azure_endpoint: Optional[str] = None,
        azure_api_version: Optional[str] = None,
        project_brief: Optional[Dict] = None,
    ) -> "PensieveRunner":
        # Artifact store
        artifact_keys = [a.key for a in process_def.state_schema]
        store = ArtifactStore(artifact_keys)

        # Write project_brief if provided
        if project_brief:
            store.write("project_brief", project_brief, "user_input")

        # Process state
        state = ProcessRunState(
            run_id=run_id,
            process_id=process_def.process_id,
            process_version=process_def.version,
            process_label=process_def.label,
        )
        state.init_steps(process_def.steps)
        state.status = "running"

        effective_model = model or process_def.default_model

        return cls(
            process_def=process_def,
            state=state,
            artifact_store=store,
            queue=queue,
            model=effective_model,
            api_key=api_key,
            api_key_type=api_key_type,
            azure_endpoint=azure_endpoint,
            azure_api_version=azure_api_version,
        )

    # ── Public API ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Called once after creation to emit initial state and greet the user."""
        run_id = self.state.run_id
        short  = run_id[:8]
        logger.info(f"[{short}] Runner starting — process={self.process_def.process_id} model={self.model}")
        try:
            await self._emit_state()
            logger.info(f"[{short}] Emitted initial state_update")

            # Check if project_brief exists; if not, ask for it
            brief = self.artifacts.read("project_brief")
            if brief:
                greeting = (
                    f"Welcome to **{self.process_def.label}**. Your project brief is loaded.\n\n"
                    f"I'll guide you through {len(self.process_def.steps)} steps across "
                    f"{len(self.process_def.phases)} phases. Let's begin with the first step: "
                    f"**{self.process_def.steps[0].label}**.\n\n"
                    "I'll generate the first output now — feel free to send me any additional "
                    "context or constraints before I run."
                )
            else:
                greeting = (
                    f"Welcome to **{self.process_def.label}**.\n\n"
                    "To get started, please share your project brief. Include:\n"
                    "- Product name and description\n"
                    "- Target users\n"
                    "- Core problem you're solving\n"
                    "- Any constraints (technical, business, timeline)\n"
                    "- Competitive context if known"
                )

            self.conversation.append({"role": "assistant", "content": greeting})
            await self._emit_chat(greeting)
            await self.queue.put(_evt("chat_done", {}, run_id))
            logger.info(f"[{short}] Greeting sent (has_brief={brief is not None})")

            # If a brief was provided up-front, auto-start the first step
            # immediately — no need to wait for a user message.
            if brief:
                logger.info(f"[{short}] Brief present — auto-starting first agent turn")
                async with self._lock:
                    self.conversation.append({
                        "role": "user",
                        "content": "Please begin. Start with the first step of the process.",
                    })
                    await self._run_agent_turn()

        except Exception as exc:
            logger.error(f"[{short}] Runner.start() crashed: {exc}", exc_info=True)
            await self._emit_error(f"Runner startup error: {exc}")

    async def send_message(self, content: str) -> None:
        """Handle a user message. Triggers a main-agent turn."""
        short = self.state.run_id[:8]
        logger.info(f"[{short}] User message received ({len(content)} chars)")
        async with self._lock:
            # If no brief exists yet, treat this message as the project brief
            # and emit a state update so the frontend knows it's been saved.
            if not self.artifacts.read("project_brief"):
                logger.info(f"[{short}] No project_brief yet — treating message as brief")
                self.artifacts.write("project_brief", {"description": content}, "user_input")
                await self._emit_state()

            self.conversation.append({"role": "user", "content": content})
            try:
                await self._run_agent_turn()
            except Exception as exc:
                logger.error(f"[{short}] send_message agent turn crashed: {exc}", exc_info=True)
                await self._emit_error(f"Agent turn error: {exc}")



    async def approve_step(self, feedback: Optional[str] = None) -> None:
        """Called from the HTTP approve endpoint to resume a paused gate."""
        self.state.resume_from_approval({"approved": True, "feedback": feedback or ""})

    # ── Main agent turn ────────────────────────────────────────────────────────

    async def _run_agent_turn(self, depth: int = 0) -> None:
        """Run one LLM turn, handling streaming + tool calls recursively."""
        short = self.state.run_id[:8]
        if depth > 25:
            logger.error(f"[{short}] Max tool-call depth (25) reached")
            await self._emit_error("Max tool-call depth reached")
            return

        messages = self._build_messages()
        tools    = self._build_tools()
        logger.info(
            f"[{short}] LLM call depth={depth} model={self._litellm_model()} "
            f"messages={len(messages)} tools={len(tools)} step={self.state.current_step}"
        )

        try:
            response = await litellm.acompletion(
                model=self._litellm_model(),
                messages=messages,
                tools=tools if tools else None,
                tool_choice="auto" if tools else None,
                stream=True,
                api_key=self.api_key,
                **({"api_base": self.azure_endpoint} if self.azure_endpoint else {}),
                **({"api_version": self.azure_api_version} if self.azure_api_version else {}),
            )
        except Exception as exc:
            logger.error(f"[{short}] litellm.acompletion failed: {exc}", exc_info=True)
            await self._emit_error(f"LLM error: {exc}")
            return

        collected_text = ""
        pending_calls: Dict[int, Dict] = {}

        async for chunk in response:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            delta = choice.delta

            if getattr(delta, "content", None):
                collected_text += delta.content
                await self._emit_chat_chunk(delta.content)

            if getattr(delta, "tool_calls", None):
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in pending_calls:
                        pending_calls[idx] = {
                            "id":        getattr(tc, "id", None) or f"call_{idx}",
                            "name":      "",
                            "arguments": "",
                        }
                    if getattr(tc, "id", None) and not pending_calls[idx]["id"]:
                        pending_calls[idx]["id"] = tc.id
                    fn = getattr(tc, "function", None)
                    if fn:
                        if getattr(fn, "name", None):
                            pending_calls[idx]["name"] += fn.name
                        if getattr(fn, "arguments", None):
                            pending_calls[idx]["arguments"] += fn.arguments

        # Add assistant message to history
        if pending_calls:
            tool_calls_list = [
                {
                    "id":       tc["id"],
                    "type":     "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
                for tc in pending_calls.values()
            ]
            self.conversation.append({
                "role":       "assistant",
                "content":    collected_text or None,
                "tool_calls": tool_calls_list,
            })

            # Flush any streamed text to the UI so each assistant turn becomes
            # its own committed message rather than accumulating indefinitely.
            # Only emit if the text has real visible content (not just whitespace).
            if collected_text.strip():
                await self.queue.put(_evt("chat_done", {}, self.state.run_id))

            # Execute each tool call
            for tc in pending_calls.values():
                try:
                    args = json.loads(tc["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}

                result = await self._dispatch_tool(tc["name"], args)

                self.conversation.append({
                    "role":         "tool",
                    "tool_call_id": tc["id"],
                    "content":      json.dumps(result),
                })

            # Recurse to let the agent respond after tool results
            await self._run_agent_turn(depth=depth + 1)

        else:
            # Final text response — no tool calls
            if collected_text:
                self.conversation.append({"role": "assistant", "content": collected_text})
            await self.queue.put(_evt("chat_done", {}, self.state.run_id))
            # NOTE: "done" (stream close) is sent by mark_step_complete when the
            # entire process is complete — NOT here. Pensieve streams stay open
            # for the lifetime of the run.


    # ── Tool dispatch ──────────────────────────────────────────────────────────

    async def _dispatch_tool(self, name: str, args: Dict) -> Dict:
        """Route tool call to backend op or sub-agent."""
        short = self.state.run_id[:8]
        kind  = "backend_op" if name in _BACKEND_OPS else "sub_agent"
        logger.info(f"[{short}] Tool dispatch: {name} ({kind}) args_keys={list(args.keys())}")
        if name in _BACKEND_OPS:
            return await self._handle_backend_op(name, args)
        else:
            return await self._invoke_sub_agent(name, args)

    async def _handle_backend_op(self, name: str, args: Dict) -> Dict:
        """Handle a backend operation tool call (pure Python, no LLM)."""
        try:
            if name == "read_artifact":
                key  = args.get("artifact_key", "")
                data = self.artifacts.read(key)
                meta = self.artifacts.get_meta(key)
                return {"artifact_key": key, "data": data, "meta": meta}

            elif name == "write_artifact":
                key  = args.get("artifact_key", "")
                data = args.get("data")
                info = self.artifacts.write(key, data, "user_edit")
                await self._push_artifact_update(key)
                await self._emit_state()
                return {"success": True, **info}

            elif name == "mark_step_complete":
                step_id = args.get("step_id", "")
                av = self.artifacts.get_version(
                    self.process_def.steps_by_id.get(step_id, type("", (), {"produces": ""})()).produces
                )
                self.state.complete_step(step_id, artifact_version=av)
                # Mark downstream as stale
                step = self.process_def.steps_by_id.get(step_id)
                if step:
                    for dep in step.downstream_dependents:
                        dep_step = self.state.get_step(dep)
                        if dep_step and dep_step.status == "completed":
                            self.state.mark_step_stale(dep, f"{step.produces} was updated")
                            self.artifacts.mark_stale(
                                self.process_def.steps_by_id[dep].produces if dep in self.process_def.steps_by_id else "",
                                f"{step.produces} was updated after this artifact was generated",
                            )

                # Auto-advance current_step to the next pending step so the
                # system prompt on the next LLM turn reflects the correct step.
                # Without this, the agent sees the completed step as "current"
                # and re-runs its tool.
                next_step = self.state.next_pending_step()
                if next_step:
                    self.state.navigate_to(next_step)
                    logger.info(f"[{self.state.run_id[:8]}] Auto-advanced to next step: {next_step}")

                await self._emit_state()

                # Close the stream when all steps are done
                if self.state.is_complete():
                    self.state.status = "completed"
                    await self._emit_state()
                    await self.queue.put(_evt("process_complete", {
                        "message": "All steps completed successfully.",
                    }, self.state.run_id))
                    await self.queue.put({"type": "done"})

                return {"success": True, "step_id": step_id, "status": "completed",
                        "next_step": next_step or "all_complete"}

            elif name == "mark_artifact_stale":
                key    = args.get("artifact_key", "")
                reason = args.get("reason", "upstream artifact changed")
                self.artifacts.mark_stale(key, reason)
                await self._emit_state()
                return {"success": True, "artifact_key": key}

            elif name == "navigate_to_step":
                step_id = args.get("step_id", "")
                ok = self.state.navigate_to(step_id)
                if ok:
                    await self._emit_state()
                    # Load existing artifact for this step into the UI
                    step = self.process_def.steps_by_id.get(step_id)
                    if step and self.artifacts.read(step.produces):
                        await self._push_artifact_update(step.produces, step.ui_template)
                return {"success": ok, "current_step": step_id}

            elif name == "emit_artifact_to_ui":
                key         = args.get("artifact_key", "")
                template_id = args.get("template_id", "generic_json")
                await self._push_artifact_update(key, template_id)
                return {"success": True}

            elif name == "request_approval":
                gate_type = args.get("gate_type", "review")
                prompt    = args.get("prompt", "Please review the output and approve to continue.")
                self.state.reset_gate()
                await self.queue.put(_evt("gate", {
                    "gate_type": gate_type,
                    "prompt":    prompt,
                    "step_id":   self.state.current_step,
                }, self.state.run_id))
                # Await human approval (blocking until HTTP endpoint resumes)
                result = await self.state.wait_for_approval(timeout=1800)  # 30-min timeout
                return {
                    "approved": result.get("approved", False) if result else False,
                    "feedback": result.get("feedback", "") if result else "",
                }

            elif name == "get_process_state":
                return self.state.to_dict()

            else:
                return {"error": f"Unknown backend op: {name}"}

        except Exception as exc:
            return {"error": str(exc), "traceback": traceback.format_exc(limit=3)}

    async def _invoke_sub_agent(self, tool_name: str, args: Dict) -> Dict:
        """Invoke a registered sub-agent tool (specialized LLM call)."""
        short = self.state.run_id[:8]
        tool_entry = get_tool(tool_name)
        if not tool_entry:
            logger.error(f"[{short}] Sub-agent tool '{tool_name}' not in registry")
            return {"error": f"No tool registered with name '{tool_name}'"}

        # Build sub-agent system prompt: base + step instructions
        current_step_id: str = self.state.current_step or ""
        step_instr      = self.process_def.step_instructions.get(current_step_id, StepInstructions())
        step_meta       = self.process_def.steps_by_id.get(current_step_id) if current_step_id else None


        sub_system = tool_entry.system_prompt
        if step_instr.context_for_sub_agent:
            sub_system += f"\n\n## Task Context\n{step_instr.context_for_sub_agent}"
        if step_instr.output_requirements:
            sub_system += f"\n\n## Output Requirements\n{step_instr.output_requirements}"
        if step_instr.quality_criteria:
            sub_system += f"\n\n## Quality Criteria\n{step_instr.quality_criteria}"

        user_msg = (
            "Generate the required output as valid JSON only. "
            "Input data:\n\n" + json.dumps(args, indent=2)
        )

        # Emit a node_start-like event so the event viewer shows activity
        await self.queue.put(_evt("node_start", {
            "agent_id":    tool_name,
            "step_label":  step_meta.label if step_meta else tool_name,
            "input_keys":  list(args.keys()),
            "context_mode": "scoped",
        }, self.state.run_id))

        sub_model = tool_entry.model_override or self.model
        logger.info(f"[{short}] Sub-agent {tool_name} starting — model={self._litellm_model(sub_model)}")
        t0 = time.time()
        try:
            response = await litellm.acompletion(
                model=self._litellm_model(sub_model),
                messages=[
                    {"role": "system", "content": sub_system},
                    {"role": "user",   "content": user_msg},
                ],
                response_format={"type": "json_object"},
                api_key=self.api_key,
                **({"api_base": self.azure_endpoint} if self.azure_endpoint else {}),
                **({"api_version": self.azure_api_version} if self.azure_api_version else {}),
            )
        except Exception as exc:
            logger.error(f"[{short}] Sub-agent {tool_name} LLM call failed: {exc}", exc_info=True)
            await self.queue.put(_evt("error", {
                "error_type":     "sub_agent_error",
                "message":        str(exc),
                "policy_applied": "retry",
            }, self.state.run_id))
            return {"error": str(exc)}

        duration_ms = int((time.time() - t0) * 1000)
        raw_content = response.choices[0].message.content or "{}"
        usage       = getattr(response, "usage", None)
        token_usage = {
            "prompt_tokens":     getattr(usage, "prompt_tokens", 0),
            "completion_tokens": getattr(usage, "completion_tokens", 0),
            "total_tokens":      getattr(usage, "total_tokens", 0),
        } if usage else {}

        logger.info(
            f"[{short}] Sub-agent {tool_name} done — "
            f"{duration_ms}ms tokens={token_usage.get('total_tokens', '?')} "
            f"output_len={len(raw_content)}"
        )

        # Parse JSON output
        try:
            result_data = json.loads(raw_content)
        except json.JSONDecodeError:
            logger.warning(f"[{short}] Sub-agent {tool_name} output is not valid JSON — attempting extraction")
            import re
            m = re.search(r'\{.*\}', raw_content, re.DOTALL)
            if m:
                try:
                    result_data = json.loads(m.group(0))
                    logger.info(f"[{short}] JSON extracted from raw output")
                except Exception:
                    logger.error(f"[{short}] JSON extraction failed — storing raw output")
                    result_data = {"raw_output": raw_content}
            else:
                logger.error(f"[{short}] No JSON found in sub-agent output")
                result_data = {"raw_output": raw_content}

        # Write artifact
        artifact_key = step_meta.produces if step_meta else tool_entry.output_key_hint
        if artifact_key:
            version_info = self.artifacts.write(artifact_key, result_data, f"tool:{tool_name}")
            artifact_version = version_info["version"]
            logger.info(f"[{short}] Artifact written: key={artifact_key} version={artifact_version}")

            # Update step state
            if current_step_id:
                self.state.set_step_in_progress(current_step_id)
                step_state = self.state.get_step(current_step_id)
                if step_state:
                    step_state.artifact_version = artifact_version

            # Emit node_complete
            await self.queue.put(_evt("node_complete", {
                "output_keys": [artifact_key],
                "token_usage": token_usage,
                "duration_ms": duration_ms,
            }, self.state.run_id))

            # Push artifact to UI
            template_id = step_meta.ui_template if step_meta else "generic_json"
            await self._push_artifact_update(artifact_key, template_id)
            await self._emit_state()

            return {
                "success":       True,
                "artifact_key":  artifact_key,
                "version":       artifact_version,
                "token_usage":   token_usage,
                "duration_ms":   duration_ms,
            }

        return {"success": True, "data": result_data}

    # ── Message building ───────────────────────────────────────────────────────

    def _build_messages(self) -> List[Dict]:
        """Assemble the full message list for the main agent LLM call."""
        return [
            {"role": "system", "content": self._build_system_prompt()},
        ] + self.conversation

    def _build_system_prompt(self) -> str:
        """Build the main agent system prompt."""
        current_step = (
            self.process_def.steps_by_id.get(self.state.current_step)
            if self.state.current_step else None
        )

        # Current step instructions
        step_instr_text = ""
        if current_step:
            instr = self.process_def.step_instructions.get(current_step.id, StepInstructions())
            step_instr_text = f"""
## Current Step: {current_step.label} (Phase: {current_step.phase_label})
Step ID: {current_step.id}
Tool: {current_step.tool}
Produces: {current_step.produces}
Consumes: {', '.join(current_step.consumes) or 'nothing'}
UI Template: {current_step.ui_template}
Selection required: {current_step.interaction.selection_required}
Review required: {current_step.interaction.review_required}

### On user interaction for this step:
{instr.on_user_interaction or '(Use global defaults)'}
"""

        # Process state summary
        steps_summary = "\n".join(
            f"  [{s['status'].upper():12s}] {s['phase_label']} → {s['label']} (id: {s['id']})"
            for s in self.state.to_dict()["steps"]
        )

        # Available artifacts
        artifact_summary = "\n".join(
            f"  {m['key']:30s} status={m['status']:12s} version={m['version']}"
            for m in self.artifacts.list_all()
        )

        return f"""You are the main orchestrator for the process: **{self.process_def.label}**.

You follow the process defined below, executing each step by invoking the appropriate sub-agent
tool, presenting results to the user, managing approvals, and handling edits and navigation requests.

## Process Definition
{self._process_md_summary()}

## Global Execution Rules
{self.process_def.global_rules or DEFAULT_GLOBAL_RULES}

## Current Process State
Run ID: {self.state.run_id}
Status: {self.state.status}
Current phase: {self.state.current_phase}
Current step: {self.state.current_step}

### Step statuses:
{steps_summary}

### Artifact store:
{artifact_summary}

{step_instr_text}

## Available backend operation tools
- read_artifact(artifact_key) → read an artifact from the store
- write_artifact(artifact_key, data) → write/edit an artifact
- mark_step_complete(step_id) → mark a step as completed and propagate staleness
- mark_artifact_stale(artifact_key, reason) → explicitly mark an artifact stale
- navigate_to_step(step_id) → navigate to a specific step
- emit_artifact_to_ui(artifact_key, template_id) → push artifact to the left panel
- request_approval(gate_type, prompt) → pause and wait for user approval
- get_process_state() → read the full process state JSON

## Sub-agent tools
You invoke these to execute a specific step. They call a specialized LLM and automatically
write the result to the artifact store and push it to the UI.
Each sub-agent tool accepts the consumed artifacts as input parameters.

## Instructions
1. When entering a new step: invoke the step's tool with the required consumed artifacts.
2. After the tool completes: call emit_artifact_to_ui, then request_approval if review is required.
3. When the user approves: call mark_step_complete, then move to the next pending step.
4. When the user requests an edit: re-invoke the tool with the edit instructions as additional context.
5. When the user navigates back: call navigate_to_step, then present the existing artifact.
6. Keep your text responses concise — the left panel shows the artifact; the chat is for guidance.
"""

    def _process_md_summary(self) -> str:
        """Compact summary of phases and steps (not the full instruction text)."""
        lines = []
        for phase in self.process_def.phases:
            lines.append(f"\n### Phase: {phase['phase_label']}")
            for step in phase["steps"]:
                lines.append(
                    f"  - {step.label} (id={step.id}, tool={step.tool}, "
                    f"produces={step.produces}, consumes={', '.join(step.consumes) or 'none'})"
                )
        return "\n".join(lines)

    def _build_tools(self) -> List[Dict]:
        """Combine backend op tool definitions + registered sub-agent tools."""
        backend_tools = [
            {
                "type": "function",
                "function": {
                    "name":        "read_artifact",
                    "description": "Read the current data for an artifact key from the store.",
                    "parameters": {
                        "type": "object",
                        "properties": {"artifact_key": {"type": "string"}},
                        "required": ["artifact_key"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "write_artifact",
                    "description": "Write or edit an artifact in the store (for user-requested edits).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "artifact_key": {"type": "string"},
                            "data":         {"type": "object", "description": "The new artifact data"},
                        },
                        "required": ["artifact_key", "data"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "mark_step_complete",
                    "description": "Mark a step as completed after user approval. Propagates staleness to dependents.",
                    "parameters": {
                        "type": "object",
                        "properties": {"step_id": {"type": "string"}},
                        "required": ["step_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "navigate_to_step",
                    "description": "Navigate to a specific step (for backward navigation requests).",
                    "parameters": {
                        "type": "object",
                        "properties": {"step_id": {"type": "string"}},
                        "required": ["step_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "emit_artifact_to_ui",
                    "description": "Push an artifact to the left panel using a specific template.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "artifact_key": {"type": "string"},
                            "template_id":  {"type": "string"},
                        },
                        "required": ["artifact_key"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "request_approval",
                    "description": "Pause execution and ask the user to approve or review the current output.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "gate_type": {
                                "type": "string",
                                "enum": ["selection", "review", "approval"],
                                "description": "Type of gate: selection=user picks an option, review=approve/edit, approval=final sign-off",
                            },
                            "prompt": {
                                "type": "string",
                                "description": "The message to show the user explaining what they need to do",
                            },
                        },
                        "required": ["gate_type", "prompt"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name":        "get_process_state",
                    "description": "Read the full process state including all step statuses.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
        ]

        # All registered sub-agent tools
        sub_agent_tools = [
            entry.as_openai_tool()
            for entry in TOOL_REGISTRY.values()
        ]

        return backend_tools + sub_agent_tools

    # ── Emit helpers ───────────────────────────────────────────────────────────

    async def _emit_chat_chunk(self, content: str) -> None:
        await self.queue.put(_evt("chat_chunk", {"content": content}, self.state.run_id))
        # Note: chat_chunk is high-frequency — only log at DEBUG to avoid noise
        logger.debug(f"[{self.state.run_id[:8]}] → chat_chunk ({len(content)} chars)")

    async def _emit_chat(self, content: str) -> None:
        logger.info(f"[{self.state.run_id[:8]}] → chat_message ({len(content)} chars)")
        await self.queue.put(_evt("chat_message", {"content": content}, self.state.run_id))

    async def _emit_state(self) -> None:
        logger.info(
            f"[{self.state.run_id[:8]}] → state_update "
            f"phase={self.state.current_phase} step={self.state.current_step}"
        )
        await self.queue.put(_evt("state_update", {
            "process_state": self.state.to_dict(),
            "phases":        self.state.phases_summary(),
        }, self.state.run_id))

    async def _emit_error(self, message: str) -> None:
        logger.error(f"[{self.state.run_id[:8]}] → error: {message}")
        await self.queue.put(_evt("error", {
            "error_type":     "runner_error",
            "message":        message,
            "policy_applied": "fail",
        }, self.state.run_id))

    async def _push_artifact_update(
        self, artifact_key: str, template_id: Optional[str] = None
    ) -> None:
        """Push an artifact update event so the frontend re-renders the left panel."""
        data = self.artifacts.read(artifact_key)
        meta = self.artifacts.get_meta(artifact_key)

        # Determine template_id from step metadata if not provided
        if not template_id:
            for step in self.process_def.steps:
                if step.produces == artifact_key:
                    template_id = step.ui_template
                    break
            template_id = template_id or "generic_json"

        logger.info(
            f"[{self.state.run_id[:8]}] → artifact_update "
            f"key={artifact_key} template={template_id} "
            f"version={meta['version'] if meta else '?'}"
        )
        await self.queue.put(_evt("artifact_update", {
            "artifact_key": artifact_key,
            "template_id":  template_id,
            "data":         data,
            "version":      meta["version"] if meta else None,
            "status":       meta["status"] if meta else "null",
        }, self.state.run_id))

    # ── Model resolution ───────────────────────────────────────────────────────

    def _litellm_model(self, model: Optional[str] = None) -> str:
        """Resolve the litellm model string based on provider."""
        m = model or self.model
        if self.api_key_type == "azure" and self.azure_endpoint:
            return f"azure/{m}"
        return m


# ── Default global rules (used if process.md has no ## Global Rules section) ──

DEFAULT_GLOBAL_RULES = """
### Step Execution Protocol
1. Check the artifact store: if the current step's artifact already exists AND is not stale,
   skip invoking the tool — go directly to emit_artifact_to_ui and request_approval.
2. Otherwise invoke the step's registered tool with consumed artifacts as input.
3. After tool completes: call emit_artifact_to_ui to show results.
4. If selection_required: call request_approval(gate_type="selection", ...) and wait.
5. If review_required: call request_approval(gate_type="review", ...) and wait.
6. On any approval: call mark_step_complete(step_id=<current_step_id>).
   The system will automatically advance current_step to the next pending step.
   Then immediately proceed to execute that new step's tool.

### Selection Gate Protocol (gate_type="selection")
When request_approval returns {"approved": true, "feedback": "I select: \"...\""} or similar:
1. Write ONE short sentence acknowledging the choice.
2. Call mark_step_complete(step_id=<current_step_id>) — this advances current_step.
3. Immediately run the NEW current step's tool. Do not pause or ask for confirmation.
CRITICAL: Do NOT re-invoke the just-completed step's tool. Selection = approval to advance.

### After mark_step_complete
- current_step is automatically updated to the next pending step by the system.
- You will see the new step in the system prompt on the next tool call.
- Never call the completed step's tool again unless explicitly asked by the user.

### Edit Handling
- Minor edit (field change): use write_artifact to update the artifact directly.
- Structural edit (add/remove/restructure): re-invoke the step's tool with edit instructions.
- After any edit: call mark_step_complete to propagate staleness downstream.

### Backward Navigation
- When user asks to go back: call navigate_to_step with the target step ID.
- Present the existing artifact via emit_artifact_to_ui.
- Wait for user action (re-generate, edit, or approve as-is).

### Communication Style
- Be concise — the artifact is shown on the left; don't repeat it in chat.
- Announce what you're about to do before invoking a tool (one sentence).
- After each approval, write ONE sentence confirming then immediately proceed.
- If a consumed artifact is stale, warn the user and ask whether to regenerate.
"""
