"""Playwright report parsing and BEFORE/AFTER screenshot pair discovery."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .util import load_json, normalize_path


@dataclass
class ImagePair:
    expected: Path
    actual: Path
    diff: Path | None
    test_title: str
    spec_path: str
    project: str
    baseline_path: Path | None


def collect_failed_tests(report: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []

    def walk_suite(suite: dict[str, Any], inherited_file: str = "") -> None:
        suite_file = suite.get("file") or inherited_file
        for spec in suite.get("specs", []) or []:
            title = " ".join([spec.get("title", ""), *spec.get("tags", [])]).strip()
            for test_case in spec.get("tests", []) or []:
                outcome = test_case.get("outcome", "")
                project = test_case.get("projectName", "")
                for result in test_case.get("results", []) or []:
                    errors = result.get("errors") or ([result.get("error")] if result.get("error") else [])
                    status = result.get("status") or outcome
                    failed = bool(errors) or outcome == "unexpected" or status not in {"passed", "skipped", "expected"}
                    if not failed:
                        continue
                    failures.append(
                        {
                            "title": title,
                            "spec_path": spec.get("file") or suite_file or "",
                            "project": project,
                            "attachments": result.get("attachments", []) or [],
                        }
                    )
        for child in suite.get("suites", []) or []:
            walk_suite(child, suite_file)

    for suite in report.get("suites", []) or []:
        walk_suite(suite)
    return failures


def strip_playwright_suffix(name: str) -> str:
    for suffix in ("-actual.png", "-expected.png", "-diff.png"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return Path(name).stem


def find_baseline(expected: Path, snapshots_root: Path) -> Path | None:
    if expected.exists() and "-snapshots" in expected.as_posix():
        return expected

    candidates = list(snapshots_root.glob(f"**/{expected.name}"))
    if len(candidates) == 1:
        return candidates[0]

    stem = strip_playwright_suffix(expected.name)
    stem_candidates = [path for path in snapshots_root.glob("**/*.png") if path.stem.startswith(stem)]
    if len(stem_candidates) == 1:
        return stem_candidates[0]
    return None


def discover_pairs(results_json: Path, test_results_dir: Path, snapshots_root: Path, repo_root: Path) -> list[ImagePair]:
    pairs: list[ImagePair] = []
    seen: set[tuple[str, str]] = set()

    report = load_json(results_json, {}) if results_json.exists() else {}
    for failure in collect_failed_tests(report):
        attachments = failure.get("attachments", [])
        by_name: dict[str, Path] = {}
        for attachment in attachments:
            name = str(attachment.get("name", "")).lower()
            path = normalize_path(attachment.get("path"), repo_root)
            if not path:
                continue
            if name in {"expected", "actual", "diff"}:
                by_name[name] = path

        expected = by_name.get("expected")
        actual = by_name.get("actual")
        if not expected or not actual:
            continue
        key = (expected.as_posix(), actual.as_posix())
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            ImagePair(
                expected=expected,
                actual=actual,
                diff=by_name.get("diff"),
                test_title=failure.get("title", "visual comparison"),
                spec_path=failure.get("spec_path", ""),
                project=failure.get("project", ""),
                baseline_path=find_baseline(expected, snapshots_root),
            )
        )

    for actual in test_results_dir.glob("**/*-actual.png"):
        expected = actual.with_name(actual.name.replace("-actual.png", "-expected.png"))
        diff = actual.with_name(actual.name.replace("-actual.png", "-diff.png"))
        if not expected.exists():
            continue
        key = (expected.as_posix(), actual.as_posix())
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            ImagePair(
                expected=expected,
                actual=actual,
                diff=diff if diff.exists() else None,
                test_title=strip_playwright_suffix(actual.name),
                spec_path="",
                project="",
                baseline_path=find_baseline(expected, snapshots_root),
            )
        )
    return pairs
