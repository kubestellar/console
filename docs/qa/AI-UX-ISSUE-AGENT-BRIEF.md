# AI UX Issue Agent Brief

Use this file as the operating brief for an AI agent that finds and reports UX issues from Playwright results.

## Goal

Identify and report only browser-reproduced UX issues from the UX scan output.

Do not report code-scan-only findings.

## Inputs

1. Run the UX scan first:

```bash
./scripts/run-ux-scan.sh
```

Notes:
- For localhost URLs, the script auto-starts a preview server when needed.
- To disable auto-start behavior, set `UX_SCAN_AUTOSTART_SERVER=false`.

2. Read these files:
- `web/test-results/ux-scan/ux-findings.json`
- `web/test-results/ux-scan/ux-summary.md`
- `web/test-results/ux-scan/playwright-report/index.html`

## Hard Rules

1. Only use findings from `ux-findings.json`.
2. Only report findings where `source.reproducedInBrowser` is `true`.
3. If no findings exist, report "No browser-reproduced UX issues found" and stop.
4. Every reported issue must include route or spec source, reproduction steps, expected, actual, and severity.
5. Do not invent failures that are not present in Playwright artifacts.

## Issue JSON Contract

Use this shape for each issue:

```json
{
  "issue": "Short title",
  "steps": ["step 1", "step 2"],
  "expected": "What should happen",
  "actual": "What happened",
  "severity": "high | medium | low"
}
```

## Agent Procedure

1. Parse `web/test-results/ux-scan/ux-findings.json`.
2. Filter to valid browser-reproduced findings.
3. Normalize severity:
- `timedOut` or console/exception failures => `high`
- assertion/navigation/visibility failures => `medium`
- cosmetic-only regressions => `low`
4. Deduplicate by issue title + source file + line.
5. Write results to `web/test-results/ux-scan/reported-issues.md`.

Do not modify this brief file. It is checked into git and should remain stable.


## Reported Issues

This section is intentionally left as an example template.
Write real run output to `web/test-results/ux-scan/reported-issues.md`.

---

### Report Batch: YYYY-MM-DD HH:MM UTC

- Status: Pending
- Total findings: 0

#### Issue 1

```json
{
  "issue": "",
  "steps": [],
  "expected": "",
  "actual": "",
  "severity": ""
}
```
