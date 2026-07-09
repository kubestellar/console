"""Package Playwright visual-regression diffs for issue-based agent triage.

The CI workflow uses Playwright as the first-pass visual change detector. When a pixel diff is found,
this package does not call a model or make the semantic verdict inside CI. Instead it:
  * parses the failed Playwright screenshot pairs (``discovery``),
  * crops or downsizes the changed regions (``imaging``),
  * stitches BEFORE/AFTER evidence images (``imaging``),
  * writes a structured evidence packet consumed by the generated GitHub issue.

The issue body is the interface to the downstream agent. That agent reads the issue, inspects the
images, and decides whether to update baselines or fix code.

Module map:
  * ``util``      - JSON/time/path helpers shared across the package.
  * ``context``   - classification constants, route/component metadata, and the canonical high-risk
                    glob matcher (kept in lock-step with ``.github/scripts/lib/glob.cjs``).
  * ``discovery`` - Playwright report parsing and BEFORE/AFTER pair discovery.
  * ``imaging``   - Pillow mask/connected-component/stitch/region helpers.
  * ``ledger``    - decision-id, ledger append/merge/ingest, and retention.
  * ``metrics``   - issue-handoff precision metrics.
  * ``cli``       - argparse entrypoint wiring the subcommands together.

``scripts/visual-diff-triage.py`` stays as a thin entrypoint delegating to ``cli.main`` so every
workflow keeps calling ``python3 scripts/visual-diff-triage.py <subcommand>`` unchanged.
"""
