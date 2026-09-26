#!/usr/bin/env python3
"""Resolve the Build Sheriff on call for a given date.

Reads the rotation defined in .github/on-call-schedule.yml (see that file for
the schema) and prints the GitHub login(s) responsible for main-branch health
on the given UTC date, one per line, without a leading "@".

Usage:
    scripts/resolve-build-sheriff.py [--schedule PATH] [--date YYYY-MM-DD] [--mentions]

    --schedule  Path to the schedule file (default: .github/on-call-schedule.yml)
    --date      UTC date to resolve (default: today)
    --mentions  Print a single space-separated line of "@login" mentions instead

Exit codes:
    0  a sheriff (or fallback) was resolved
    1  the schedule is missing or malformed
    2  no sheriff could be resolved and no fallback is configured
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

import yaml

DEFAULT_SCHEDULE = Path(".github/on-call-schedule.yml")
DAYS_PER_WEEK = 7
# GitHub login rules: 1-39 alphanumerics or hyphens, no leading/trailing or
# consecutive hyphens. Anything else would render as a broken @-mention.
GITHUB_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")
EXIT_OK = 0
EXIT_BAD_SCHEDULE = 1
EXIT_NO_SHERIFF = 2


class ScheduleError(ValueError):
    """Raised when the schedule file cannot be parsed or is invalid."""


def _parse_date(value, field: str) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError as exc:
        raise ScheduleError(f"{field}: expected YYYY-MM-DD, got {value!r}") from exc


def _week_start(day: dt.date) -> dt.date:
    """Monday of the ISO week containing `day`."""
    return day - dt.timedelta(days=day.weekday())


def _logins(value, field: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ScheduleError(f"{field}: expected a list of GitHub logins")
    logins = [v.strip().lstrip("@") for v in value]
    for raw, login in zip(value, logins):
        if not GITHUB_LOGIN_RE.match(login):
            raise ScheduleError(f"{field}: {raw!r} is not a valid GitHub login")
    return logins


def load_schedule(path: Path) -> dict:
    try:
        raw = yaml.safe_load(path.read_text())
    except FileNotFoundError as exc:
        raise ScheduleError(f"schedule not found: {path}") from exc
    except yaml.YAMLError as exc:
        raise ScheduleError(f"schedule is not valid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ScheduleError("schedule must be a YAML mapping")
    return raw


def resolve(schedule: dict, day: dt.date) -> list[str]:
    """Return the login(s) on call for `day`, or [] if none can be resolved."""
    monday = _week_start(day)

    for entry in schedule.get("overrides") or []:
        if not isinstance(entry, dict) or "week_start" not in entry or "sheriff" not in entry:
            raise ScheduleError("overrides: each entry needs week_start and sheriff")
        if _week_start(_parse_date(entry["week_start"], "overrides.week_start")) == monday:
            return _logins([entry["sheriff"]], "overrides.sheriff")

    rotation = _logins(schedule.get("rotation"), "rotation")
    if rotation:
        if "epoch" not in schedule:
            raise ScheduleError("epoch is required when rotation is non-empty")
        epoch = _week_start(_parse_date(schedule["epoch"], "epoch"))
        weeks = (monday - epoch).days // DAYS_PER_WEEK
        if weeks >= 0:
            return [rotation[weeks % len(rotation)]]

    return _logins(schedule.get("fallback"), "fallback")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--schedule", type=Path, default=DEFAULT_SCHEDULE)
    parser.add_argument("--date", default=None)
    parser.add_argument("--mentions", action="store_true")
    args = parser.parse_args(argv)

    try:
        day = (
            dt.date.fromisoformat(args.date)
            if args.date
            else dt.datetime.now(dt.timezone.utc).date()
        )
    except ValueError:
        print(f"error: --date must be YYYY-MM-DD, got {args.date!r}", file=sys.stderr)
        return EXIT_BAD_SCHEDULE

    try:
        sheriffs = resolve(load_schedule(args.schedule), day)
    except ScheduleError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_BAD_SCHEDULE

    if not sheriffs:
        print("error: no sheriff resolved and no fallback configured", file=sys.stderr)
        return EXIT_NO_SHERIFF

    if args.mentions:
        print(" ".join(f"@{s}" for s in sheriffs))
    else:
        print("\n".join(sheriffs))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
