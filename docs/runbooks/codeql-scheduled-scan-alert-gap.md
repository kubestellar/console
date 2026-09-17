# CodeQL Scheduled Scan Alert Gap Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/codeql.yml`, `.github/workflows/workflow-failure-issue.yml`

---

## Scope Note

This runbook covers the case where the **nightly scheduled run of `CodeQL Security
Analysis` fails outright** (build/setup failure, CodeQL action or database-init
breakage, runner or upstream outage) rather than completing and reporting zero or
more code-scanning alerts. A completed scan with findings is not an incident — those
surface normally through GitHub code-scanning alerts. This runbook is only about the
scan never finishing.

## Current Status

**Fixed.** `"CodeQL Security Analysis"` was added to the
`workflow_run.workflows` allow-list in `.github/workflows/workflow-failure-issue.yml`
(PR [#23521](https://github.com/kubestellar/console/pull/23521)), so a failed
scheduled CodeQL run now opens/updates a tracked issue automatically. Tracking
issue [#23119](https://github.com/kubestellar/console/issues/23119) is closed.

## Why This Can Happen Silently

`codeql.yml` runs on `schedule: cron: '30 5 * * *'` in addition to `push` /
`pull_request` / `workflow_dispatch`, and its analyze steps have no
`continue-on-error`, so a scheduled run that fails correctly reports
`conclusion: failure` on the workflow run itself.

The gap was downstream: `workflow-failure-issue.yml` is the repo's centralized
"open/comment on a GitHub issue when a scheduled workflow fails" mechanism, and its
`workflow_run.workflows` allow-list did not include `"CodeQL Security Analysis"` —
even though the comparable scheduled scan `"OpenSSF Scorecard"` was on the list.
It now is, closing the repo's only scheduled static-analysis security coverage
(Go + JavaScript CodeQL queries) gap.

## Detecting a Pipeline Failure

| Signal | Where to look | Status |
|---|---|---|
| Dedicated alert issue (`workflow-failure` label, title `Workflow failure: CodeQL Security Analysis`) | Issues labeled `workflow-failure` | Available |
| Workflow run status | Actions → `CodeQL Security Analysis` → scheduled runs | Works today |
| Code-scanning alerts freshness | Security → Code scanning alerts, filtered by tool `CodeQL` | A long gap with no new/updated alerts on a codebase that is actively changing is a secondary signal of a broken scheduled scan |

## Triage

1. Open Actions → `CodeQL Security Analysis` and check the most recent scheduled
   (cron-triggered) run's conclusion.
2. If failed, inspect the failing step's logs (Go build/setup, `codeql-action/init`,
   `codeql-action/analyze`, `codeql-action/upload-sarif`) for the root cause.
3. Cross-check Security → Code scanning alerts for staleness consistent with the
   outage window.

## Recovery

1. Fix the underlying cause (toolchain/build breakage, action version pin, runner
   capacity).
2. Re-run via `workflow_dispatch` to confirm the scan completes and uploads results.

## Verifying Recovery

- Confirm the next scheduled run completes with `conclusion: success` and that new
  code-scanning results are visible for the run's commit.

## Proposed Fix (applied)

```diff
       # Weekly reviews
       - "OpenSSF Scorecard"
       - "Weekly Coverage Review"
+      # Scheduled security static analysis
+      - "CodeQL Security Analysis"
     types:
       - completed
```

This one-line addition to `.github/workflows/workflow-failure-issue.yml` is now
merged. No change to `codeql.yml` itself was required.

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions once the scheduled
scan is confirmed healthy again.
