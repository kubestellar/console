# CodeQL Scheduled Scan Alert Gap Runbook

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

**The fix below (adding `"CodeQL Security Analysis"` to the `workflow_run.workflows`
allow-list in `workflow-failure-issue.yml`) is not merged.** The `operations` agent's
GitHub App token lacks the `workflows` permission required to create or update any
file under `.github/workflows/` — a push of this exact one-line change was rejected
by GitHub before a PR could be opened:

```
! [remote rejected] ops/codeql-failure-alert-scope -> ops/codeql-failure-alert-scope
  (refusing to allow a GitHub App to create or update workflow
  `.github/workflows/workflow-failure-issue.yml` without `workflows` permission)
```

Until a maintainer with that permission applies the change manually, a failed
scheduled CodeQL run produces no GitHub issue and no on-call signal — it only shows
up as a red run in the Actions tab. See tracking issue
[#23119](https://github.com/kubestellar/console/issues/23119).

## Why This Can Happen Silently

`codeql.yml` runs on `schedule: cron: '30 5 * * *'` in addition to `push` /
`pull_request` / `workflow_dispatch`, and its analyze steps have no
`continue-on-error`, so a scheduled run that fails correctly reports
`conclusion: failure` on the workflow run itself.

The gap is downstream: `workflow-failure-issue.yml` is the repo's centralized
"open/comment on a GitHub issue when a scheduled workflow fails" mechanism, and its
`workflow_run.workflows` allow-list does not include `"CodeQL Security Analysis"` —
even though the comparable scheduled scan `"OpenSSF Scorecard"` is on the list. As a
result, nothing listens for a CodeQL scheduled-run failure, and this is the repo's
only scheduled static-analysis security coverage (Go + JavaScript CodeQL queries).

## Detecting a Pipeline Failure

| Signal | Where to look | Status |
|---|---|---|
| Dedicated alert issue (`workflow-failure` label, title `Workflow failure: CodeQL Security Analysis`) | Issues labeled `workflow-failure` | Not yet available — see [Current Status](#current-status) |
| Workflow run status | Actions → `CodeQL Security Analysis` → scheduled runs | Works today, but requires manually checking every run |
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

## Proposed Fix

```diff
       # Weekly reviews
       - "OpenSSF Scorecard"
       - "Weekly Coverage Review"
+      # Scheduled security static analysis
+      - "CodeQL Security Analysis"
     types:
       - completed
```

A maintainer with the `workflows` GitHub App permission (or push access) needs to
apply this one-line addition directly to `.github/workflows/workflow-failure-issue.yml`;
it cannot be delivered as an automated PR from this agent for the reason described in
[Current Status](#current-status). No change to `codeql.yml` itself is required.

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions once the scheduled
scan is confirmed healthy again.
