"""Issue-agent handoff precision metrics computed from the in-repo ledger."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from .context import AGENT_TRIAGE_CLASSIFICATION
from .ledger import load_ledger_rows
from .util import load_json, utc_now, write_json

METRIC_LABELS = ("regression", "intended_change", "noise")
PREDICTION_LABELS = (AGENT_TRIAGE_CLASSIFICATION, "noise")

# Defaults mirror .github/visual-triage-config.json; used only when a config key is missing.
DEFAULT_TARGET_HANDOFF_PRECISION = 0.95
DEFAULT_MIN_SAMPLES = 50


def compute_metrics(
    rows: list[dict[str, Any]],
    target_handoff_precision: float,
    min_samples: int,
) -> dict[str, Any]:
    """Measure whether the issue handoff signal helped the downstream agent.

    CI only predicts either ``agent_triage_required`` or ``noise``. Rows resolved as regression or
    intended_change are useful handoffs; rows resolved as noise are unnecessary handoffs. The learning
    loop therefore tracks handoff precision and missed handoffs instead of model confidence cutoffs.

    Note: since only agent_triage rows are ledgered, ``noise_rows`` is normally empty here, so
    ``missed_handoffs``/``noise_precision`` reflect the known noise-miss blind spot documented in
    ledger.py rather than a measurable rate.
    """
    labeled = [r for r in rows if r.get("human_outcome") in METRIC_LABELS and r.get("predicted") in PREDICTION_LABELS]
    confusion = {p: {a: 0 for a in METRIC_LABELS} for p in PREDICTION_LABELS}
    for r in labeled:
        confusion[r["predicted"]][r["human_outcome"]] += 1
    handoff_rows = [r for r in labeled if r.get("predicted") == AGENT_TRIAGE_CLASSIFICATION]
    noise_rows = [r for r in labeled if r.get("predicted") == "noise"]
    useful_handoffs = sum(1 for r in handoff_rows if r.get("human_outcome") in {"regression", "intended_change"})
    false_handoffs = sum(1 for r in handoff_rows if r.get("human_outcome") == "noise")
    missed_handoffs = sum(1 for r in noise_rows if r.get("human_outcome") in {"regression", "intended_change"})
    handoff_precision = useful_handoffs / len(handoff_rows) if handoff_rows else None
    noise_precision = sum(1 for r in noise_rows if r.get("human_outcome") == "noise") / len(noise_rows) if noise_rows else None
    resolution_mix = {label: sum(1 for r in labeled if r.get("human_outcome") == label) for label in METRIC_LABELS}
    return {
        "sample_size": len(labeled),
        "confusion_matrix": confusion,
        "handoff_precision": handoff_precision,
        "noise_precision": noise_precision,
        "agent_handoff_count": len(handoff_rows),
        "useful_handoffs": useful_handoffs,
        "false_handoffs": false_handoffs,
        "missed_handoffs": missed_handoffs,
        "resolution_mix": resolution_mix,
        "target_handoff_precision": target_handoff_precision,
        "min_samples": min_samples,
        "enough_samples": len(labeled) >= min_samples,
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{value:.3f}" if isinstance(value, float) else str(value)


def render_metrics_markdown(report: dict[str, Any]) -> str:
    enough = report["enough_samples"]
    sample_note = "enough for trend reporting" if enough else f"need >= {report['min_samples']}"
    lines = [
        "## Visual issue-agent handoff metrics",
        "",
        f"- Samples with verdicts: `{report['sample_size']}` ({sample_note})",
        f"- Agent handoff precision target: `{report['target_handoff_precision']}`",
        f"- Agent handoff precision: `{_fmt(report['handoff_precision'])}`",
        f"- Noise-pass precision: `{_fmt(report['noise_precision'])}`",
        f"- Useful handoffs: `{report['useful_handoffs']}`",
        f"- False handoffs: `{report['false_handoffs']}`",
        f"- Missed handoffs: `{report['missed_handoffs']}`",
        "",
        "| Resolution outcome | Count |",
        "|---|--:|",
    ]
    for label in METRIC_LABELS:
        lines.append(f"| {label} | {report['resolution_mix'][label]} |")
    lines += [
        "",
        "Handoff matrix (rows = CI route, cols = resolved outcome):",
        "",
        "| pred \\ actual | " + " | ".join(METRIC_LABELS) + " |",
        "|---|" + "---|" * len(METRIC_LABELS),
    ]
    for p in PREDICTION_LABELS:
        lines.append(f"| {p} | " + " | ".join(str(report["confusion_matrix"][p][a]) for a in METRIC_LABELS) + " |")
    return "\n".join(lines) + "\n"


def run_metrics(args: argparse.Namespace) -> int:
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    target = float(thresholds.get("target_handoff_precision", DEFAULT_TARGET_HANDOFF_PRECISION))
    min_samples = int(thresholds.get("min_samples", DEFAULT_MIN_SAMPLES))
    ledger_path = Path(args.ledger)
    rows = load_ledger_rows(ledger_path)
    report = compute_metrics(rows, target, min_samples)
    report["timestamp"] = utc_now()
    if args.output:
        write_json(Path(args.output), report)
    markdown = render_metrics_markdown(report)
    if args.markdown:
        Path(args.markdown).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown).write_text(markdown, encoding="utf-8")
    # Persist aggregate outcome quality once there is enough signal; CI routing stays deterministic.
    if args.tuning_file and report["enough_samples"]:
        tuning_path = Path(args.tuning_file)
        tuning = load_json(tuning_path, {"schema_version": 1})
        tuning["recent_handoff_precision"] = report["handoff_precision"]
        tuning["recent_noise_precision"] = report["noise_precision"]
        tuning["updated_at"] = report["timestamp"]
        tuning["sample_size"] = report["sample_size"]
        write_json(tuning_path, tuning)
    print(markdown)
    return 0
