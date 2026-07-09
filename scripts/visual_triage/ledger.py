"""Triage ledger: decision ids, append (agent_triage rows only), retention, merge, and verdict ingest.

Persistence model: full decisions live only in the per-run artifact (triage-results.json). Only the
compact, joinable rows for ``routing == agent_triage`` decisions are persisted to the in-repo JSONL
ledger. Noise decisions are intentionally NOT ledgered - they are recorded in visual-flaky-log.json
only.

Known blind spot: because noise decisions never enter the ledger, the metrics loop cannot measure a
"missed handoff" (a diff CI routed as noise that a human later found to be a real regression). That
trade-off keeps the ledger small and its precision numbers honest for the handoffs CI actually made.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .util import utc_now

DECISION_ID_LEN = 16
VALID_OUTCOMES = {"regression", "intended_change", "noise"}
AGENT_TRIAGE_ROUTING = "agent_triage"

# Bounded retention for the committed ledger. Rows carrying a resolved verdict are pruned once older
# than LEDGER_RETENTION_DAYS; pending (unresolved) rows are kept regardless of age so a late green can
# still attach a verdict. As a hard safety cap the ledger is trimmed to the most recent LEDGER_MAX_ROWS.
LEDGER_MAX_ROWS = 5000
LEDGER_RETENTION_DAYS = 180


def compute_decision_id(pr_number: str, spec_path: str, test_title: str, baseline_path: str) -> str:
    """Deterministic, idempotent join key for a triage decision.

    Hashes only stable inputs (no time/random) so a re-triggered run produces the same id, letting
    a later human/resolution verdict be joined back to the original prediction.
    """
    raw = f"{pr_number}|{spec_path}|{test_title}|{baseline_path}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:DECISION_ID_LEN]


def load_ledger_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def write_ledger_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, sort_keys=False) + "\n" for row in rows), encoding="utf-8")


def _parse_ts(row: dict[str, Any]) -> datetime | None:
    raw = row.get("verdict_ts") or row.get("ts") or ""
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def prune_ledger_rows(
    rows: list[dict[str, Any]],
    now: datetime | None = None,
    max_rows: int = LEDGER_MAX_ROWS,
    retention_days: int = LEDGER_RETENTION_DAYS,
) -> list[dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    kept: list[dict[str, Any]] = []
    for row in rows:
        has_verdict = row.get("human_outcome") is not None
        timestamp = _parse_ts(row)
        # Drop resolved rows past the retention window; keep pending rows so a late green can still
        # attach a verdict.
        if has_verdict and timestamp is not None and timestamp < cutoff:
            continue
        kept.append(row)
    if len(kept) > max_rows:
        kept = kept[-max_rows:]
    return kept


def _ledger_row(decision: dict[str, Any], pr: dict[str, Any]) -> dict[str, Any]:
    return {
        "decision_id": decision.get("decision_id"),
        "ts": decision.get("timestamp"),
        "pr": pr.get("number", ""),
        "spec_path": decision.get("spec_path", ""),
        "test_title": decision.get("test_title", ""),
        "component_name": decision.get("component_name", ""),
        "predicted": decision.get("classification"),
        "confidence": decision.get("confidence"),
        "routing": decision.get("routing"),
        "high_risk": decision.get("high_risk", False),
        "human_outcome": None,
        "verdict_source": None,
    }


def append_ledger_rows(ledger_path: Path, decisions: list[dict[str, Any]], pr: dict[str, Any]) -> None:
    """Append one compact, joinable row per agent_triage decision, then apply retention.

    Only ``routing == agent_triage`` decisions are persisted; noise decisions stay in the run artifact
    and visual-flaky-log.json. human_outcome/verdict_source start null and are filled in by
    ``ingest-verdict``.
    """
    persistable = [decision for decision in decisions if decision.get("routing") == AGENT_TRIAGE_ROUTING]
    if not persistable:
        return
    rows = load_ledger_rows(ledger_path)
    rows.extend(_ledger_row(decision, pr) for decision in persistable)
    write_ledger_rows(ledger_path, prune_ledger_rows(rows))


def merge_ledger_files(ledger_path: Path, artifact_path: Path | None) -> int:
    """Append-only merge of an artifact ledger into the canonical ledger, deduped by decision_id.

    Canonical rows win on conflict so a verdict already recorded is never clobbered. Retention is
    applied so the committed ledger stays bounded.
    """
    seen: set[Any] = set()
    merged: list[dict[str, Any]] = []
    for path in (ledger_path, artifact_path):
        if path is None:
            continue
        for row in load_ledger_rows(path):
            decision_id = row.get("decision_id")
            if decision_id in seen:
                continue
            seen.add(decision_id)
            merged.append(row)
    merged = prune_ledger_rows(merged)
    write_ledger_rows(ledger_path, merged)
    return len(merged)


def ingest_verdict(ledger_path: Path, decision_id: str, outcome: str, source: str, verdict_ts: str) -> int:
    """Record a resolution verdict onto matching agent_triage rows, joined by decision_id.

    The ``routing == agent_triage`` guard is the ingest-side noise filter: even if a noise decision_id
    were somehow passed in, it will not receive a verdict (noise rows are never ledgered anyway).
    """
    rows = load_ledger_rows(ledger_path)
    updated = 0
    for row in rows:
        if row.get("decision_id") == decision_id and row.get("routing") == AGENT_TRIAGE_ROUTING:
            row["human_outcome"] = outcome
            row["verdict_source"] = source
            row["verdict_ts"] = verdict_ts
            updated += 1
    write_ledger_rows(ledger_path, rows)
    return updated


def run_ingest_verdict(args: argparse.Namespace) -> int:
    """Record a human/resolution verdict against a prior decision, joined by decision_id.

    This is how ground truth enters the loop: the close workflow (or a maintainer label) calls this
    with how a failure was actually resolved, so accuracy can later be measured.
    """
    if args.outcome not in VALID_OUTCOMES:
        raise SystemExit(f"invalid --outcome: {args.outcome!r} (expected one of {sorted(VALID_OUTCOMES)})")
    ledger_path = Path(args.ledger)
    if not ledger_path.exists():
        print(f"::warning::ledger not found: {ledger_path}")
        return 0
    verdict_ts = args.verdict_ts or utc_now()
    updated = ingest_verdict(ledger_path, args.decision_id, args.outcome, args.source, verdict_ts)
    if updated == 0:
        print(f"::warning::no ledger row matched decision_id {args.decision_id}")
    print(json.dumps({"decision_id": args.decision_id, "outcome": args.outcome, "rows_updated": updated}))
    return 0


def run_merge_ledger(args: argparse.Namespace) -> int:
    """Seed the canonical ledger with any rows a CI run's artifact ledger is missing.

    The failing Visual Regression run appends decision rows to its runner checkout and uploads them as
    an artifact, but never commits them. Before the close-on-green workflow can write a resolution
    verdict back onto those rows, the canonical ledger must actually contain them.
    """
    ledger_path = Path(args.ledger)
    artifact = (args.artifact_ledger or "").strip()
    if not artifact:
        print("No artifact ledger to merge; leaving canonical ledger unchanged.")
        return 0
    artifact_path = Path(artifact)
    if not artifact_path.exists():
        print(f"Artifact ledger {artifact_path} not found; leaving canonical ledger unchanged.")
        return 0
    count = merge_ledger_files(ledger_path, artifact_path)
    print(f"Merged ledger now has {count} rows.")
    return 0
