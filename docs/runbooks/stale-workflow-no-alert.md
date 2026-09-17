# Stale Issues Workflow — No Failure Alert Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/stale.yml`

---

## Current Status

**Fixed.** `"Stale Issues"` was added to the `workflows:` catch-all in
`.github/workflows/workflow-failure-issue.yml` (PR
[#23525](https://github.com/kubestellar/console/pull/23525)), so a failure of
this workflow now opens/updates a tracked issue automatically. Tracking issue
[#23193](https://github.com/kubestellar/console/issues/23193) is closed.

## Why This Matters

`stale.yml` ("Stale Issues") runs daily (`cron: '0 0 * * *'`) and delegates to the
shared `kubestellar/infra` `reusable-stale.yml` workflow to mark/close inactive
issues and PRs. It previously had no internal issue-creation-on-failure step and
was not listed in `.github/workflows/workflow-failure-issue.yml`'s catch-all
`workflows:` list; `"Stale Issues"` is now on that list.

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

## Proposed Fix (applied)

`"Stale Issues"` (the exact `name:` field value from `stale.yml`) was added to the
`workflows:` list in `.github/workflows/workflow-failure-issue.yml`, reusing the
catch-all's existing dedup-by-title-and-label logic and comment-on-recurring-failure
behavior — no change to `stale.yml` itself was needed.

## Escalation

If a scheduled `stale.yml` run is found to have failed and gone unnoticed, check
whether the underlying `kubestellar/infra` `reusable-stale.yml` workflow has an
unrelated outage affecting multiple consumer repos before assuming a console-specific
issue.
