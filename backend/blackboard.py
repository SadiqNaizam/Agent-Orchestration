"""
Blackboard — the shared execution context for a single orchestration run.

Key conventions
───────────────
  __input__                   original run input (immutable)
  __orchestration_metadata__  run-level counters / timestamps
  __compaction_history__      log of compaction events
  __spawned__                 ephemeral spawned-agent outputs

Agent output slots follow the pattern:
  {node_id}.output            raw output dict from the agent
  {node_id}.metadata          token usage, latency, completed_at
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class Blackboard:
    def __init__(self, input_data: dict, orchestration_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._store: Dict[str, Any] = {
            "__input__": input_data,
            "__orchestration_metadata__": {
                "orchestration_id": orchestration_id,
                "started_at": now,
                "current_step": 0,
                "total_tokens_consumed": 0,
            },
            "__compaction_history__": [],
            "__spawned__": {},
        }

    # ── Basic operations ───────────────────────────────────────────────────────

    def read(self, key: str) -> Any:
        return self._store.get(key)

    def write(self, key: str, value: Any) -> None:
        self._store[key] = value

    def keys(self) -> List[str]:
        return list(self._store.keys())

    def get_all(self) -> Dict[str, Any]:
        return dict(self._store)

    def get_agent_visible(self) -> Dict[str, Any]:
        """Return all non-system keys (for shared context_mode)."""
        return {
            k: v for k, v in self._store.items()
            if not (k.startswith("__") and k.endswith("__"))
        }

    # ── Metadata helpers ───────────────────────────────────────────────────────

    def increment_step(self) -> None:
        self._store["__orchestration_metadata__"]["current_step"] += 1

    def add_tokens(self, count: int) -> None:
        self._store["__orchestration_metadata__"]["total_tokens_consumed"] += count

    @property
    def total_tokens(self) -> int:
        return self._store["__orchestration_metadata__"]["total_tokens_consumed"]

    # ── JSONPath resolution ────────────────────────────────────────────────────

    def resolve_jsonpath(self, expr: str) -> Any:
        """
        Resolve simple JSONPath expressions against the blackboard.

        Supported forms
        ───────────────
          $.input.key             → __input__["key"]
          $.node_id.output        → blackboard key "node_id.output"
          $.node_id.output.field  → blackboard key "node_id.output", then ["field"]

        Non-JSONPath strings are returned as-is (literal values).
        """
        if not expr.startswith("$."):
            return expr

        path = expr[2:]           # strip "$."
        parts = path.split(".")

        # Special: $.input.* → __input__
        if parts[0] == "input":
            value = self._store.get("__input__", {})
            for part in parts[1:]:
                value = self._dig(value, part)
            return value

        # Try the longest matching compound key first
        # e.g. "researcher.output.content" → try "researcher.output" first
        for split_at in range(len(parts), 0, -1):
            compound_key = ".".join(parts[:split_at])
            if compound_key in self._store:
                value = self._store[compound_key]
                for part in parts[split_at:]:
                    value = self._dig(value, part)
                return value

        return None

    @staticmethod
    def _dig(value: Any, part: str) -> Any:
        if isinstance(value, dict):
            return value.get(part)
        if isinstance(value, list):
            try:
                return value[int(part)]
            except (ValueError, IndexError):
                return None
        return None

    # ── Condition evaluation ───────────────────────────────────────────────────

    def evaluate_condition(self, expression: str) -> bool:
        """
        Evaluate a deterministic condition against the blackboard.

        Supported operators: ==  !=  >  <  >=  <=
        Examples
          $.quality_reviewer.output.approved == true
          $.score.value > 0.8
          $.classifier.output.category == 'technical'
        """
        expr = expression.strip()

        for op in (" >= ", " <= ", " != ", " == ", " > ", " < "):
            if op in expr:
                left_s, right_s = expr.split(op, 1)
                left = self._resolve_scalar(left_s.strip())
                right = self._resolve_scalar(right_s.strip())
                op = op.strip()
                try:
                    if op == "==":  return left == right
                    if op == "!=":  return left != right
                    if op == ">":   return left > right
                    if op == "<":   return left < right
                    if op == ">=":  return left >= right
                    if op == "<=":  return left <= right
                except TypeError:
                    return False

        return bool(self._resolve_scalar(expr))

    def _resolve_scalar(self, s: str) -> Any:
        if s.startswith("$."):
            return self.resolve_jsonpath(s)
        if s.lower() == "true":   return True
        if s.lower() == "false":  return False
        if s.lower() in ("null", "none"): return None
        if (s.startswith("'") and s.endswith("'")) or \
           (s.startswith('"') and s.endswith('"')):
            return s[1:-1]
        try:
            return int(s)
        except ValueError:
            pass
        try:
            return float(s)
        except ValueError:
            pass
        return s
