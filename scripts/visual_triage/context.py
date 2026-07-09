"""Classification constants, route/component metadata, and the canonical high-risk glob matcher.

Route/component/contract metadata lives in a single source of truth, ``.github/visual-routes.json``,
which is ALSO read by ``.github/scripts/visual-regression-failure-issue.cjs``. The glob matcher must
stay byte-for-byte equivalent to ``.github/scripts/lib/glob.cjs``; the shared fixture
``.github/scripts/lib/high-risk-glob-cases.json`` locks that parity via cross-language tests.
"""

from __future__ import annotations

import functools
import json
import re
from pathlib import Path
from typing import Any

# Package layout: scripts/visual_triage/context.py -> parents[2] is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROUTES_FILE = _REPO_ROOT / ".github" / "visual-routes.json"

AGENT_TRIAGE_CLASSIFICATION = "agent_triage_required"
AGENT_TRIAGE_REASONING = (
    "Playwright detected a visual screenshot mismatch. CI packaged the BEFORE/AFTER evidence "
    "for the issue-scanning agent; no in-CI model verdict was made. The agent must inspect the "
    "issue images and PR context to decide whether this is an intended UI change, noise, or a regression."
)

_DEFAULT_COMPONENT_HINT = "visual-regression screenshot region"
_DEFAULT_COMPONENT_PURPOSE = "Stable visual contract for this route/component in the console UI."
_DEFAULT_COMPONENT_NAME = "visual-regression"


@functools.lru_cache(maxsize=1)
def _routes_data() -> dict[str, Any]:
    try:
        with DEFAULT_ROUTES_FILE.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


# -- Canonical high-risk glob semantics (mirror of .github/scripts/lib/glob.cjs) --
# `**` crosses `/`, a single `*` does not cross `/`, `?` and every other regex metacharacter is a
# literal, and the match is anchored to the full path.
_GLOB_DOUBLESTAR_TOKEN = "\x00"
_GLOB_METACHAR_RE = re.compile(r"[.+^${}()|\[\]\\?]")


@functools.lru_cache(maxsize=256)
def glob_to_regex(glob: str) -> re.Pattern[str]:
    escaped = _GLOB_METACHAR_RE.sub(lambda match: "\\" + match.group(0), str(glob))
    escaped = escaped.replace("**", _GLOB_DOUBLESTAR_TOKEN)
    escaped = escaped.replace("*", "[^/]*")
    escaped = escaped.replace(_GLOB_DOUBLESTAR_TOKEN, ".*")
    return re.compile("^" + escaped + "$")


def matches_any_glob(path: str, globs: list[str]) -> bool:
    target = str(path or "")
    return any(glob_to_regex(glob).search(target) is not None for glob in (globs or []))


def high_risk(changed_files: list[str], config: dict[str, Any]) -> bool:
    patterns = config.get("issue_agent", {}).get("high_risk_globs", [])
    return any(matches_any_glob(file, patterns) for file in (changed_files or []))


def component_from_pair(spec_path: str, test_title: str) -> tuple[str, str]:
    source = spec_path or test_title
    lower = source.lower()
    route = "unknown"
    for entry in _routes_data().get("route_keywords", []) or []:
        keyword = entry.get("keyword", "")
        if keyword and keyword in lower:
            route = entry.get("route", "unknown")
            break
    return (Path(source).name or test_title or _DEFAULT_COMPONENT_NAME, route)


def route_context(route: str, component_name: str) -> dict[str, str]:
    context = (_routes_data().get("routes", {}) or {}).get(route, {})
    return {
        "component_hint": context.get("component_hint") or component_name or _DEFAULT_COMPONENT_HINT,
        "purpose": context.get("purpose") or _DEFAULT_COMPONENT_PURPOSE,
    }
