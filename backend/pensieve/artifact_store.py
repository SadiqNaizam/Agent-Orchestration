"""
Artifact Store — versioned key-value store for all process outputs.

Every write creates a new version. Reads always return the latest version.
Supports stale-marking for feedback propagation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ── Data types ─────────────────────────────────────────────────────────────────

class ArtifactVersion:
    __slots__ = ("version", "data", "created_at", "created_by")

    def __init__(self, version: int, data: Any, created_by: str) -> None:
        self.version    = version
        self.data       = data
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.created_by = created_by

    def to_dict(self) -> Dict:
        return {
            "version":    self.version,
            "data":       self.data,
            "created_at": self.created_at,
            "created_by": self.created_by,
        }


class ArtifactEntry:
    def __init__(self, key: str) -> None:
        self.key      = key
        self.versions: List[ArtifactVersion] = []
        self.status   = "null"      # null | generated | approved | stale | auto_approved
        self.stale_reason: Optional[str] = None
        self.stale_since:  Optional[str] = None

    @property
    def current_version(self) -> Optional[ArtifactVersion]:
        return self.versions[-1] if self.versions else None

    @property
    def current_data(self) -> Any:
        v = self.current_version
        return v.data if v else None

    def to_dict(self) -> Dict:
        cv = self.current_version
        return {
            "key":           self.key,
            "status":        self.status,
            "version":       cv.version if cv else None,
            "updated_at":    cv.created_at if cv else None,
            "stale_reason":  self.stale_reason,
            "stale_since":   self.stale_since,
            "version_count": len(self.versions),
        }


# ── Store ──────────────────────────────────────────────────────────────────────

class ArtifactStore:
    """Versioned in-memory store. Keys are declared at initialization."""

    def __init__(self, declared_keys: List[str]) -> None:
        self._store: Dict[str, ArtifactEntry] = {
            k: ArtifactEntry(k) for k in declared_keys
        }

    # ── Reads ──────────────────────────────────────────────────────────────────

    def read(self, key: str) -> Optional[Any]:
        """Return current data for key, or None if not yet written."""
        entry = self._store.get(key)
        return entry.current_data if entry else None

    def get_meta(self, key: str) -> Optional[Dict]:
        entry = self._store.get(key)
        return entry.to_dict() if entry else None

    def list_all(self) -> List[Dict]:
        return [e.to_dict() for e in self._store.values()]

    def get_status(self, key: str) -> str:
        entry = self._store.get(key)
        return entry.status if entry else "null"

    def get_version(self, key: str) -> Optional[int]:
        entry = self._store.get(key)
        cv = entry.current_version if entry else None
        return cv.version if cv else None

    # ── Writes ─────────────────────────────────────────────────────────────────

    def write(self, key: str, data: Any, created_by: str = "agent") -> Dict:
        """Write a new version of an artifact. Creates slot if key is unknown."""
        if key not in self._store:
            self._store[key] = ArtifactEntry(key)

        entry   = self._store[key]
        version = len(entry.versions) + 1
        entry.versions.append(ArtifactVersion(version, data, created_by))
        entry.status      = "generated"
        entry.stale_reason = None
        entry.stale_since  = None

        return {
            "key":        key,
            "version":    version,
            "updated_at": entry.current_version.created_at,
        }

    def mark_approved(self, key: str) -> None:
        entry = self._store.get(key)
        if entry and entry.versions:
            entry.status = "approved"

    def mark_stale(self, key: str, reason: str) -> None:
        entry = self._store.get(key)
        if entry and entry.versions:
            entry.status       = "stale"
            entry.stale_reason = reason
            entry.stale_since  = datetime.now(timezone.utc).isoformat()

    def clear_stale(self, key: str) -> None:
        entry = self._store.get(key)
        if entry:
            entry.stale_reason = None
            entry.stale_since  = None
            if entry.status == "stale":
                entry.status = "approved"

    # ── Version history ────────────────────────────────────────────────────────

    def get_history(self, key: str) -> List[Dict]:
        entry = self._store.get(key)
        if not entry:
            return []
        return [v.to_dict() for v in entry.versions]

    def rollback(self, key: str) -> bool:
        """Remove the current (latest) version, reverting to the previous."""
        entry = self._store.get(key)
        if not entry or len(entry.versions) < 2:
            return False
        entry.versions.pop()
        return True

    # ── Snapshot ───────────────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Return all current artifact data as a flat dict (for context injection)."""
        return {
            k: e.current_data
            for k, e in self._store.items()
            if e.current_data is not None
        }
