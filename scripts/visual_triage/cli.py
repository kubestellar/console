"""argparse entrypoint wiring the visual_triage subcommands together."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from . import context, discovery, imaging, ledger, metrics
from .context import AGENT_TRIAGE_CLASSIFICATION
from .util import load_json, rel, utc_now, write_json

# Outcome strings consumed by the Enforce step in visual-regression.yml.
OUTCOME_PASS = "pass"
OUTCOME_AGENT_TRIAGE = "agent_triage"
OUTCOME_ERROR = "error"

ROUTING_ERROR = "error"

# Cap the stored exception text on a failed pair so one broken image cannot bloat the artifact.
ERROR_MESSAGE_MAX_CHARS = 200

# Self-test fixture accuracy must be perfect for the self-test to pass.
SELF_TEST_MIN_ACCURACY = 1.0
# Default eval accuracy gate when neither the flag nor config provides one.
DEFAULT_EVAL_MIN_ACCURACY = 0.8


def _error_decision(base_decision: dict[str, Any], exc: Exception) -> dict[str, Any]:
    return {
        **base_decision,
        "classification": f"error:{type(exc).__name__}",
        "confidence": 0.0,
        "routing": ROUTING_ERROR,
        "reasoning": f"Failed to process this image pair: {exc}",
        "model_called": False,
        "requires_agent_triage": True,
        "regions": [],
        "error": str(exc)[:ERROR_MESSAGE_MAX_CHARS],
    }


def run_triage(args: argparse.Namespace) -> int:
    imaging.require_pillow()
    repo_root = Path(args.repo_root).resolve()
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    output_dir = Path(args.output_dir).resolve()
    crop_dir = output_dir / "crops"
    output_dir.mkdir(parents=True, exist_ok=True)

    changed_files = (
        [line.strip() for line in Path(args.changed_files).read_text(encoding="utf-8").splitlines() if line.strip()]
        if args.changed_files else []
    )
    pr = {
        "number": os.getenv("PR_NUMBER", args.pr_number or ""),
        "title": args.pr_title or os.getenv("PR_TITLE", ""),
        "head_sha": os.getenv("GITHUB_SHA", ""),
    }
    is_high_risk = context.high_risk(changed_files, config)

    pairs = discovery.discover_pairs(
        results_json=Path(args.playwright_results).resolve(),
        test_results_dir=Path(args.test_results_dir).resolve(),
        snapshots_root=Path(args.snapshots_root).resolve(),
        repo_root=repo_root,
    )

    decisions: list[dict[str, Any]] = []

    for pair_index, pair in enumerate(pairs, start=1):
        component_name, route = context.component_from_pair(pair.spec_path, pair.test_title)
        baseline_rel = rel(pair.baseline_path, repo_root) if pair.baseline_path else None
        base_decision = {
            "decision_id": ledger.compute_decision_id(pr.get("number", ""), pair.spec_path, pair.test_title, baseline_rel or ""),
            "timestamp": utc_now(),
            "pr": pr,
            "test_title": pair.test_title,
            "spec_path": pair.spec_path,
            "component_name": component_name,
            "route": route,
            "expected_path": rel(pair.expected, repo_root),
            "actual_path": rel(pair.actual, repo_root),
            "diff_path": rel(pair.diff, repo_root) if pair.diff else None,
            "baseline_path": baseline_rel,
            "high_risk": is_high_risk,
            "human_outcome": None,
        }

        # Per-pair fail-closed: a single broken/unreadable image records an error decision and keeps
        # the run going instead of crashing (and instead of silently passing).
        try:
            before_raw = imaging.Image.open(pair.expected)
            after_raw = imaging.Image.open(pair.actual)
            before, after = imaging.ensure_same_size(before_raw, after_raw)
            mask = imaging.build_mask(before, after, int(thresholds.get("pixel_channel_threshold", imaging.DEFAULT_PIXEL_CHANNEL_THRESHOLD)))
            changed_pixels = mask.histogram()[255]
            total_pixels = before.width * before.height
            changed_ratio = changed_pixels / total_pixels if total_pixels else 0
            image_fields = {
                "changed_pixels": changed_pixels,
                "total_pixels": total_pixels,
                "changed_area_ratio": changed_ratio,
            }

            if changed_pixels == 0:
                decisions.append({**base_decision, **image_fields, "classification": "noise", "confidence": 1.0, "routing": OUTCOME_PASS, "reasoning": "Pixel masks are identical; no agent triage needed.", "model_called": False, "requires_agent_triage": False, "regions": []})
                continue

            if changed_ratio < float(thresholds.get("noise_changed_area_ratio", imaging.DEFAULT_NOISE_CHANGED_AREA_RATIO)):
                bbox = imaging.bbox_with_padding(mask.getbbox() or (0, 0, before.width, before.height), before.width, before.height, int(thresholds.get("crop_padding_px", imaging.DEFAULT_CROP_PADDING_PX)))
                crop_path = crop_dir / f"pair-{pair_index}-noise.png"
                imaging.stitch(before, after, bbox, crop_path)
                decisions.append({**base_decision, **image_fields, "classification": "noise", "confidence": 1.0, "routing": OUTCOME_PASS, "reasoning": "Changed area is below the configured noise threshold; no agent issue is needed.", "model_called": False, "requires_agent_triage": False, "regions": [{"bbox": bbox, "stitched_crop": rel(crop_path, repo_root)}]})
                continue

            regions = imaging.build_evidence_regions(mask, config)
            if not regions:
                regions = [{"bbox": imaging.bbox_with_padding(mask.getbbox() or (0, 0, before.width, before.height), before.width, before.height, int(thresholds.get("crop_padding_px", imaging.DEFAULT_CROP_PADDING_PX))), "changed_pixels": changed_pixels, "mode": "fallback_crop"}]

            region_results: list[dict[str, Any]] = []
            for region_index, region in enumerate(regions, start=1):
                bbox = tuple(region["bbox"])
                crop_path = crop_dir / f"pair-{pair_index}-region-{region_index}.png"
                imaging.stitch(before, after, bbox, crop_path)
                metadata = imaging.enrich_region(region, before.width, before.height, route, component_name, region_index, len(regions))
                result = {
                    "classification": AGENT_TRIAGE_CLASSIFICATION,
                    "confidence": 0.0,
                    "reasoning": metadata["evidence_note"],
                    "suspected_component": metadata["component_hint"],
                    "severity": None,
                    **metadata,
                }
                result["stitched_crop"] = rel(crop_path, repo_root)
                region_results.append(result)

            primary = region_results[0]
            decisions.append({**base_decision, **image_fields, **primary, "routing": OUTCOME_AGENT_TRIAGE, "model_called": False, "requires_agent_triage": True, "regions": region_results})
        except Exception as exc:  # noqa: BLE001 - fail closed on a bad image rather than crashing the run
            decisions.append(_error_decision(base_decision, exc))

    counts: dict[str, int] = {}
    for decision in decisions:
        counts[decision.get("routing", "unknown")] = counts.get(decision.get("routing", "unknown"), 0) + 1

    # Fail-closed outcome resolution. A real agent handoff is the normal failing path. If Playwright
    # reported a failure but we could not parse any pair, or a pair errored while processing, we must
    # NOT emit `pass` (that would green a genuinely failed visual run) - emit `error` so the Enforce
    # step fails CI.
    has_error = any(decision.get("routing") == ROUTING_ERROR for decision in decisions)
    has_triage = any(decision.get("routing") == OUTCOME_AGENT_TRIAGE for decision in decisions)
    if has_triage:
        outcome = OUTCOME_AGENT_TRIAGE
    elif has_error or not pairs:
        outcome = OUTCOME_ERROR
    else:
        outcome = OUTCOME_PASS

    summary = {
        "timestamp": utc_now(),
        "outcome": outcome,
        "model_calls": 0,
        "model_tokens": 0,
        "budget_exhausted": False,
        "issue_interface": True,
        "decision_counts": counts,
        "pair_count": len(pairs),
        "baseline_update_count": 0,
    }
    report = {"summary": summary, "decisions": decisions, "baseline_updates": []}
    write_json(output_dir / "triage-results.json", report)
    write_json(
        output_dir / "visual-flaky-log.json",
        {
            "timestamp": summary["timestamp"],
            "noise_decisions": [decision for decision in decisions if decision.get("classification") == "noise"],
        },
    )

    # Persistence model: full decisions live only in the run artifact (triage-results.json above);
    # one compact joinable row per agent_triage decision is appended to the in-repo JSONL ledger; the
    # tuning file holds only small derived state (no unbounded raw-decision history).
    ledger_path = repo_root / config.get("ledger_file", ".github/triage-ledger.jsonl")
    ledger.append_ledger_rows(ledger_path, decisions, pr)
    if ledger_path.exists():
        shutil.copy2(ledger_path, output_dir / "triage-ledger.jsonl")

    tuning_path = repo_root / config.get("tuning_file", ".github/triage-tuning.json")
    tuning = load_json(tuning_path, {"schema_version": 1})
    tuning.pop("history", None)  # migrate away from the old unbounded raw-decision history
    tuning.pop("recommended_confidence_cutoff", None)  # migrate away from dead calibration fields
    tuning.pop("calibrated_at", None)
    tuning["schema_version"] = 1
    tuning["last_updated"] = summary["timestamp"]
    tuning["last_run"] = {
        "outcome": outcome,
        "decision_counts": counts,
        "pair_count": len(pairs),
        "model_calls": 0,
        "issue_interface": True,
    }
    write_json(tuning_path, tuning)
    shutil.copy2(tuning_path, output_dir / "triage-tuning.json")

    github_output = os.getenv("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"outcome={outcome}\n")
            handle.write("model_calls=0\n")
            handle.write("baseline_update_count=0\n")

    print(json.dumps(summary, indent=2))
    return 0


def run_self_test(args: argparse.Namespace) -> int:
    imaging.require_pillow()
    with tempfile.TemporaryDirectory() as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        repo = temp_dir / "repo"
        results = repo / "web/e2e/test-results/app-visual/fixtures"
        snapshots = repo / "web/e2e/visual/app-fixture.spec.ts-snapshots"
        results.mkdir(parents=True)
        snapshots.mkdir(parents=True)
        (repo / ".github").mkdir(parents=True)
        config_path = repo / ".github/visual-triage-config.json"
        config = load_json(Path(args.config), {})
        config["tuning_file"] = ".github/triage-tuning.json"
        write_json(config_path, config)
        expected = {"noise": "noise", "intentional": AGENT_TRIAGE_CLASSIFICATION, "regression": AGENT_TRIAGE_CLASSIFICATION}
        for kind in expected:
            before_path, _after_path = imaging.make_fixture_pair(results, kind, kind)
            shutil.copy2(before_path, snapshots / before_path.name)
        report_path = repo / "web/e2e/test-results/app-visual-results/results.json"
        write_json(report_path, {"suites": []})
        changed_files = repo / "changed-files.txt"
        changed_files.write_text("web/src/components/DemoCard.tsx\n", encoding="utf-8")
        output = repo / "web/e2e/test-results/visual-triage"
        triage_args = argparse.Namespace(
            repo_root=str(repo),
            config=str(config_path),
            playwright_results=str(report_path),
            test_results_dir=str(repo / "web/e2e/test-results/app-visual"),
            snapshots_root=str(repo / "web/e2e/visual"),
            output_dir=str(output),
            changed_files=str(changed_files),
            pr_title="visual triage self-test",
            pr_number="self-test",
        )
        run_triage(triage_args)
        result = load_json(output / "triage-results.json", {})
        correct = 0
        rows = []
        for decision in result.get("decisions", []):
            name = Path(decision.get("actual_path", "")).name.split("-actual", 1)[0]
            expected_class = expected.get(name)
            actual_class = decision.get("classification")
            ok = actual_class == expected_class
            correct += int(ok)
            rows.append({"fixture": name, "expected": expected_class, "actual": actual_class, "ok": ok})
        accuracy = correct / len(rows) if rows else 0
        summary = {"accuracy": accuracy, "correct": correct, "total": len(rows), "rows": rows}
        print(json.dumps(summary, indent=2))
        return 0 if accuracy >= SELF_TEST_MIN_ACCURACY else 1


def run_eval(args: argparse.Namespace) -> int:
    """Run the evidence-packaging pipeline against a curated set and gate on routing accuracy.

    Since semantic judgment is delegated to the issue-scanning agent, this gate only checks that noise
    cases are ignored and non-noise cases are packaged for agent triage.
    """
    imaging.require_pillow()
    config = load_json(Path(args.config), {})
    thresholds = config.get("thresholds", {})
    min_accuracy = float(args.min_accuracy) if args.min_accuracy else float(thresholds.get("eval_min_accuracy", DEFAULT_EVAL_MIN_ACCURACY))
    cases_dir = Path(args.cases_dir)
    case_dirs = sorted(d for d in cases_dir.glob("*") if d.is_dir() and (d / "meta.json").exists())
    if not case_dirs:
        print(f"::warning::no eval cases under {cases_dir}")
        return 0
    rows: list[dict[str, Any]] = []
    correct = 0
    confusion: dict[str, dict[str, int]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        crop_dir = Path(tmp)
        for case in case_dirs:
            meta = load_json(case / "meta.json", {})
            expected_label = meta.get("expected")
            expected = "noise" if expected_label == "noise" else AGENT_TRIAGE_CLASSIFICATION
            try:
                result = imaging.classify_images(
                    imaging.Image.open(case / "before.png"), imaging.Image.open(case / "after.png"),
                    config, crop_dir / f"{case.name}.png",
                )
            except Exception as exc:  # never let one bad case crash the gate
                result = {"classification": f"error:{exc}", "confidence": 0.0}
            predicted = result.get("classification")
            ok = predicted == expected
            correct += int(ok)
            confusion.setdefault(expected, {}).setdefault(predicted, 0)
            confusion[expected][predicted] += 1
            rows.append({"case": case.name, "label": expected_label, "expected": expected, "predicted": predicted,
                         "confidence": result.get("confidence"), "ok": ok})
    total = len(rows)
    accuracy = correct / total if total else 0.0
    summary = {
        "accuracy": round(accuracy, 4), "correct": correct, "total": total,
        "min_accuracy": min_accuracy, "mock": False, "confusion": confusion, "rows": rows,
    }
    if args.output:
        write_json(Path(args.output), summary)
    print(json.dumps(summary, indent=2))
    if accuracy < min_accuracy:
        print(f"::error::Visual triage eval accuracy {accuracy:.3f} < required {min_accuracy}.")
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Package Playwright visual diffs for issue-agent handoff.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    triage_parser = subparsers.add_parser("triage")
    triage_parser.add_argument("--repo-root", default=".")
    triage_parser.add_argument("--config", default=".github/visual-triage-config.json")
    triage_parser.add_argument("--playwright-results", default="web/e2e/test-results/app-visual-results/results.json")
    triage_parser.add_argument("--test-results-dir", default="web/e2e/test-results/app-visual")
    triage_parser.add_argument("--snapshots-root", default="web/e2e/visual")
    triage_parser.add_argument("--output-dir", default="web/e2e/test-results/visual-triage")
    triage_parser.add_argument("--changed-files", default="")
    triage_parser.add_argument("--pr-title", default="")
    triage_parser.add_argument("--pr-number", default="")
    triage_parser.set_defaults(func=run_triage)

    self_test_parser = subparsers.add_parser("self-test")
    self_test_parser.add_argument("--config", default=".github/visual-triage-config.json")
    self_test_parser.set_defaults(func=run_self_test)

    ingest_parser = subparsers.add_parser("ingest-verdict")
    ingest_parser.add_argument("--ledger", default=".github/triage-ledger.jsonl")
    ingest_parser.add_argument("--decision-id", required=True)
    ingest_parser.add_argument("--outcome", required=True, help="regression | intended_change | noise")
    ingest_parser.add_argument("--source", default="resolution-derived")
    ingest_parser.add_argument("--verdict-ts", default="")
    ingest_parser.set_defaults(func=ledger.run_ingest_verdict)

    merge_parser = subparsers.add_parser("merge-ledger")
    merge_parser.add_argument("--ledger", default=".github/triage-ledger.jsonl")
    merge_parser.add_argument("--artifact-ledger", default=os.getenv("ARTIFACT_LEDGER", ""))
    merge_parser.set_defaults(func=ledger.run_merge_ledger)

    metrics_parser = subparsers.add_parser("metrics")
    metrics_parser.add_argument("--config", default=".github/visual-triage-config.json")
    metrics_parser.add_argument("--ledger", default=".github/triage-ledger.jsonl")
    metrics_parser.add_argument("--output", default="", help="path to write triage-metrics.json")
    metrics_parser.add_argument("--markdown", default="", help="path to write the markdown summary")
    metrics_parser.add_argument("--tuning-file", default=".github/triage-tuning.json")
    metrics_parser.set_defaults(func=metrics.run_metrics)

    eval_parser = subparsers.add_parser("eval")
    eval_parser.add_argument("--config", default=".github/visual-triage-config.json")
    eval_parser.add_argument("--cases-dir", default="web/e2e/visual/triage-eval/cases")
    eval_parser.add_argument("--output", default="")
    eval_parser.add_argument("--min-accuracy", default="")
    eval_parser.set_defaults(func=run_eval)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
