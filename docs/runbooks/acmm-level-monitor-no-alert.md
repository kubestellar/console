# ACMM Level Monitor — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/acmm-level-monitor.yml`

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (confirmed in prior sessions; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Until a maintainer with that permission
adds the fix described below, a failure of this workflow's *job execution* produces
no notification of any kind. See tracking issue
[#23235](https://github.com/kubestellar/console/issues/23235).

## Why This Matters

`acmm-level-monitor.yml` ("ACMM Level Monitor") runs daily (`cron: '0 8 * * *'`) and
checks the repo's ACMM badge level, opening a `bug,acmm-regression` issue when the
badge reports a genuine drop below the required minimum. That data-driven alerting
path works, but it only fires when the job **runs to completion**. The workflow has
no `if: failure()` step, and it is not listed in
`.github/workflows/workflow-failure-issue.yml`'s catch-all `workflows:` list.

If any step other than the initial `curl` fetch fails — e.g. the inline Python
parsing the badge JSON raises an unhandled exception on an unexpected response
shape, or the `gh issue create` / `gh issue comment` calls themselves error (rate
limit, transient API failure, permissions) — the run ends in `conclusion: failure`
with no automated notification. A genuine ACMM level regression occurring at the
same time as such a job failure would go completely undetected, since the one step
that would have caught it never finished.

This is distinct from #23233, which covers the workflow *succeeding* but reporting a
misleading diagnosis when the badge endpoint is unreachable (curl failure is already
handled and reported, just mislabeled as a regression instead of an outage). That
fix does not add any `failure()`-triggered alerting and would not close this gap.
This is the same "no failure alert" gap class already confirmed for 13 other
scheduled workflows in #23144 and its follow-up runbooks
(`docs/runbooks/scheduled-workflow-alert-gap-remaining.md`,
`docs/runbooks/stale-workflow-no-alert.md`,
`docs/runbooks/upgrade-smoke-no-alert.md`,
`docs/runbooks/console-live-promote-no-alert.md`), just not previously checked for
this specific workflow.

## Detecting a Failure Today

```bash
gh run list --repo kubestellar/console --workflow=acmm-level-monitor.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` means a scheduled ACMM check
failed to complete with no automated notification sent.

## Proposed Fix

Add `"ACMM Level Monitor"` (the exact `name:` field value from
`acmm-level-monitor.yml`) to the `workflows:` list in
`.github/workflows/workflow-failure-issue.yml`. This reuses the catch-all's existing
dedup-by-title-and-label logic and comment-on-recurring-failure behavior — no change
to `acmm-level-monitor.yml` itself is needed.

## Escalation

If a scheduled run is found to have failed and gone unnoticed, treat it as
higher-urgency than a typical repo-hygiene gap: unlike most jobs in this gap class,
a missed run here can mask a genuine ACMM level regression indefinitely. Check the
[ACMM leaderboard](https://console.kubestellar.io/acmm?repo=kubestellar%2Fconsole)
directly to confirm the current level before assuming all is well.
