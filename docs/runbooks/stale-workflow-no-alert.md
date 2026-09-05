# Stale Issues Workflow — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/stale.yml`

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (confirmed in prior sessions; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Until a maintainer with that permission
adds the fix described below, a failure of this workflow produces no notification of
any kind. See tracking issue
[#23193](https://github.com/kubestellar/console/issues/23193).

## Why This Matters

`stale.yml` ("Stale Issues") runs daily (`cron: '0 0 * * *'`) and delegates to the
shared `kubestellar/infra` `reusable-stale.yml` workflow to mark/close inactive
issues and PRs. It has no internal issue-creation-on-failure step and is not listed
in `.github/workflows/workflow-failure-issue.yml`'s catch-all `workflows:` list.

Impact is lower than a user-facing canary (repo hygiene, not production traffic),
but a silent failure here means stale issues/PRs accumulate unnoticed indefinitely.
The same gap class has already been confirmed for this exact workflow in sibling
repos (`kubestellar/docs` #6729, `kubestellar/console-kb` #3199); this runbook closes
the same gap for `kubestellar/console`.

## Detecting a Failure Today

```bash
gh run list --repo kubestellar/console --workflow=stale.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` means a scheduled stale-triage
run failed with no automated notification sent.

## Proposed Fix

Add `"Stale Issues"` (the exact `name:` field value from `stale.yml`) to the
`workflows:` list in `.github/workflows/workflow-failure-issue.yml`. This reuses the
catch-all's existing dedup-by-title-and-label logic and comment-on-recurring-failure
behavior — no new code path, and no change to `stale.yml` itself is needed.

## Escalation

If a scheduled `stale.yml` run is found to have failed and gone unnoticed, check
whether the underlying `kubestellar/infra` `reusable-stale.yml` workflow has an
unrelated outage affecting multiple consumer repos before assuming a console-specific
issue.
