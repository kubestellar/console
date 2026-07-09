#!/usr/bin/env python3
"""Thin entrypoint for the visual-regression issue-agent triage CLI.

The implementation lives in the ``scripts/visual_triage/`` package. This shim is kept at the original
path so every workflow keeps invoking ``python3 scripts/visual-diff-triage.py <subcommand>`` unchanged
(subcommands: triage / self-test / ingest-verdict / merge-ledger / metrics / eval).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the package directory (this file's directory) is importable regardless of the caller's cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from visual_triage.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
