# Nightly Test Results

This directory stores daily JSON snapshots from the
[Nightly Test Suite](../../.github/workflows/nightly-test-suite.yml) workflow.

## File format

Each file is named `YYYY-MM-DD.json` and contains:

```jsonc
{
  "timestamp": "2026-04-29T08:02:23Z",   // ISO 8601 UTC
  "fastMode": false,                      // true when fast-mode CI ran
  "summary": {
    "total": 32,                          // number of test suites executed
    "passed": 32,
    "failed": 0,
    "skipped": 0
  },
  "results": [
    {
      "suite": "unit-test",               // maps to scripts/<suite>.sh
      "status": "pass",                   // pass | fail | skip
      "duration": 1659,                   // wall-clock seconds
      "failure_reason": "..."             // only present when status == "fail"
    }
    // ...
  ]
}
```

## Analysis scripts

| Script | Purpose |
|--------|---------|
| `scripts/nightly-compare.sh` | Compare current run with previous; generate markdown diff |
| `scripts/nightly-health-dashboard.sh` | Generate JSON health summary (trends, flaky detection, timing) |
| `scripts/nightly-weekly-summary.sh` | Generate a markdown weekly report from health data |

### Generate a dashboard health JSON

```bash
# Default: last 7 runs
./scripts/nightly-health-dashboard.sh

# Custom window (last 14 runs)
./scripts/nightly-health-dashboard.sh test-results/nightly 14
```

The output JSON is designed to be consumed by the Console's dashboard cards
or posted as a GitHub issue comment.

### Generate a weekly summary

```bash
./scripts/nightly-weekly-summary.sh | tee weekly-report.md
```

## Retention

Files are committed back to `main` by the nightly workflow. Old results are
kept indefinitely — they are small (~2 KB each) and useful for trend analysis.

## GitHub Actions integration

To post the weekly summary as a comment on a tracking issue, add a step like:

```yaml
- name: Post weekly summary
  if: github.event.schedule && (github.run_number % 7 == 0)
  uses: peter-evans/create-or-update-comment@v4
  with:
    issue-number: 10354
    body-path: weekly-report.md
```
