"""
Process State — persistent JSON object tracking execution progress.

Designed to survive session breaks: the entire state is a dict that can
be serialized to JSON and loaded back on reconnect.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ── Allowed step statuses ──────────────────────────────────────────────────────
STATUS_PENDING     = "pending"
STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED   = "completed"
STATUS_STALE       = "stale"
STATUS_SKIPPED     = "skipped"
STATUS_FAILED      = "failed"


class StepState:
    def __init__(self, step_id: str, phase_id: str, phase_label: str, label: str, order: int) -> None:
        self.id            = step_id
        self.phase_id      = phase_id
        self.phase_label   = phase_label
        self.label         = label
        self.order         = order
        self.status        = STATUS_PENDING
        self.artifact_version: Optional[int] = None
        self.approval_type: Optional[str]    = None   # user_approved | auto_advanced | accepted_stale
        self.started_at:    Optional[str]    = None
        self.completed_at:  Optional[str]    = None
        self.stale_reason:  Optional[str]    = None

    def to_dict(self) -> Dict:
        return {
            "id":               self.id,
            "phase_id":         self.phase_id,
            "phase_label":      self.phase_label,
            "label":            self.label,
            "order":            self.order,
            "status":           self.status,
            "artifact_version": self.artifact_version,
            "approval_type":    self.approval_type,
            "started_at":       self.started_at,
            "completed_at":     self.completed_at,
            "stale_reason":     self.stale_reason,
        }


class ProcessRunState:
    """
    The complete runtime state for one process run.

    This object is the single source of truth. The runner reads it on every
    turn, updates it after every state-changing action, and the frontend
    receives a snapshot via SSE state_update events.
    """

    def __init__(
        self,
        run_id: str,
        process_id: str,
        process_version: str,
        process_label: str,
    ) -> None:
        self.run_id          = run_id
        self.process_id      = process_id
        self.process_version = process_version
        self.process_label   = process_label
        self.status          = "initializing"  # initializing | running | paused | completed | failed
        self.current_phase:  Optional[str] = None
        self.current_step:   Optional[str] = None
        self.started_at      = datetime.now(timezone.utc).isoformat()
        self.completed_at:   Optional[str] = None
        self.steps:          Dict[str, StepState] = {}
        self.step_order:     List[str] = []    # ordered list of step IDs

        # Approval gate — the runner awaits this; the HTTP endpoint sets it
        self._approval_event: asyncio.Event = asyncio.Event()
        self._approval_data:  Optional[Dict[str, Any]] = None

    # ── Step management ────────────────────────────────────────────────────────

    def init_steps(self, steps: list) -> None:
        """Populate step list from ProcessDefinition.steps."""
        from pensieve.process_parser import StepMetadata  # avoid circular
        for s in steps:
            ss = StepState(s.id, s.phase_id, s.phase_label, s.label, s.order)
            self.steps[s.id] = ss
            self.step_order.append(s.id)
        if self.step_order:
            first = self.steps[self.step_order[0]]
            self.current_phase = first.phase_id
            self.current_step  = first.id

    def get_step(self, step_id: str) -> Optional[StepState]:
        return self.steps.get(step_id)

    def set_step_in_progress(self, step_id: str) -> None:
        s = self.steps.get(step_id)
        if s:
            s.status     = STATUS_IN_PROGRESS
            s.started_at = datetime.now(timezone.utc).isoformat()
        self.current_phase = self.steps[step_id].phase_id if step_id in self.steps else self.current_phase
        self.current_step  = step_id
        self.status        = "running"

    def complete_step(self, step_id: str, approval_type: str = "user_approved", artifact_version: Optional[int] = None) -> None:
        s = self.steps.get(step_id)
        if s:
            s.status           = STATUS_COMPLETED
            s.completed_at     = datetime.now(timezone.utc).isoformat()
            s.approval_type    = approval_type
            if artifact_version is not None:
                s.artifact_version = artifact_version

    def mark_step_stale(self, step_id: str, reason: str) -> None:
        s = self.steps.get(step_id)
        if s and s.status == STATUS_COMPLETED:
            s.status       = STATUS_STALE
            s.stale_reason = reason

    def clear_step_stale(self, step_id: str) -> None:
        s = self.steps.get(step_id)
        if s and s.status == STATUS_STALE:
            s.status       = STATUS_PENDING
            s.stale_reason = None

    def navigate_to(self, step_id: str) -> bool:
        if step_id not in self.steps:
            return False
        self.current_step  = step_id
        self.current_phase = self.steps[step_id].phase_id
        return True

    def next_pending_step(self) -> Optional[str]:
        """Return the first step that is not completed or skipped."""
        for sid in self.step_order:
            s = self.steps[sid]
            if s.status not in (STATUS_COMPLETED, STATUS_SKIPPED):
                return sid
        return None

    def is_complete(self) -> bool:
        return all(
            s.status in (STATUS_COMPLETED, STATUS_SKIPPED)
            for s in self.steps.values()
        )

    # ── Approval gate ──────────────────────────────────────────────────────────

    def reset_gate(self) -> None:
        self._approval_event.clear()
        self._approval_data = None
        self.status = "paused"

    async def wait_for_approval(self, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        if timeout:
            try:
                await asyncio.wait_for(asyncio.shield(self._approval_event.wait()), timeout=timeout)
            except asyncio.TimeoutError:
                return None
        else:
            await self._approval_event.wait()
        return self._approval_data

    def resume_from_approval(self, data: Optional[Dict[str, Any]] = None) -> None:
        self._approval_data = data or {}
        self._approval_event.set()
        self.status = "running"

    # ── Serialization ──────────────────────────────────────────────────────────

    def to_dict(self) -> Dict:
        return {
            "run_id":          self.run_id,
            "process_id":      self.process_id,
            "process_version": self.process_version,
            "process_label":   self.process_label,
            "status":          self.status,
            "current_phase":   self.current_phase,
            "current_step":    self.current_step,
            "started_at":      self.started_at,
            "completed_at":    self.completed_at,
            "steps":           [s.to_dict() for s in self._ordered_steps()],
            "is_complete":     self.is_complete(),
        }

    def _ordered_steps(self) -> List[StepState]:
        return [self.steps[sid] for sid in self.step_order if sid in self.steps]

    def phases_summary(self) -> List[Dict]:
        """Return phases with step statuses — for phase navigation in the UI."""
        phases: Dict[str, Dict] = {}
        for sid in self.step_order:
            s = self.steps[sid]
            if s.phase_id not in phases:
                phases[s.phase_id] = {
                    "id":    s.phase_id,
                    "label": s.phase_label,
                    "steps": [],
                }
            phases[s.phase_id]["steps"].append({
                "id":     s.id,
                "label":  s.label,
                "status": s.status,
                "order":  s.order,
            })
        return list(phases.values())
