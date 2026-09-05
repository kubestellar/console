# Console Live Promote — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/console-live-promote.yml`

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (confirmed in prior sessions; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Until a maintainer with that permission
adds the fix described below, a failure of this workflow produces **no notification
of any kind** beyond an automatic Helm rollback. See tracking issue
[#23193](https://github.com/kubestellar/console/issues/23193).

## Why This Matters

`console-live-promote.yml` ("Console Live Promote") runs every 12 hours
(`cron: '17 */12 * * *'`) and deploys the current `main` candidate to the **public**
`console-live` environment before running live canary tests against it. On a failed
deploy or test it automatically runs `helm rollback` to restore the previous release,
so a bad candidate does not stay live — but nothing tells anyone the promotion
failed and rolled back.

This is not a theoretical gap: issue
[#23186](https://github.com/kubestellar/console/issues/23186) shows the workflow
failed 3 consecutive scheduled runs starting 2026-09-04, and it was only noticed
because `ci-maintainer` happened to review Actions history — not because any alert
fired. With the fix below, the first failure would have opened/updated a tracked
issue immediately instead of the regression going unnoticed for 3 cycles (36 hours).

## Detecting a Failure Today

```bash
gh run list --repo kubestellar/console --workflow=console-live-promote.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` means a scheduled promotion run
failed (and was very likely automatically rolled back) with no automated
notification sent.

## Proposed Fix

Add `"Console Live Promote"` (the exact `name:` field value from
`console-live-promote.yml`) to the `workflows:` list in
`.github/workflows/workflow-failure-issue.yml`. This reuses the catch-all's existing
dedup-by-title-and-label logic and comment-on-recurring-failure behavior — no new
code path, and no change to `console-live-promote.yml` itself is needed.

## Escalation

If a scheduled `console-live-promote.yml` run is found to have failed and gone
unnoticed, check whether the automatic `helm rollback` succeeded (search the run log
for `live-rollback.log` contents). If rollback also failed, treat as a P1: the public
`console-live` environment may be running a broken candidate. If rollback succeeded,
it is still a P2 — investigate why the candidate failed its live canary tests before
the next scheduled promotion attempt repeats the same failure.
