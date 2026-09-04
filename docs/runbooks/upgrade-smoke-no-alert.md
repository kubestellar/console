# In-Place Upgrade Smoke — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/upgrade-smoke.yml`

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (verified in a prior session against `nightly-dast.yml`; the same
constraint applies here). Until a maintainer with that permission adds the fix
described below, a failure of this workflow produces **no notification of any kind**
— only a red run in the Actions tab. See tracking issue
[#23144](https://github.com/kubestellar/console/issues/23144).

## Why This Matters

`upgrade-smoke.yml` ("In-Place Upgrade Smoke") is described in its own header comment
as "the gold-standard canary for the self-upgrade mechanism," warning that "If this
workflow fails on main, every deployed console instance's upgrade path is potentially
broken." It runs on a 6-hour cron (`17 */6 * * *`) and exercises the full self-upgrade
path: build baseline/head images, install via Helm into a Kind cluster, trigger
`/api/self-upgrade/trigger`, and verify the upgraded pod becomes healthy.

Unlike `nightly-dashboard-health.yml` (which opens a GitHub issue on failure) or the
generic `workflow-failure-issue.yml` catch-all (which covers "Nightly Dashboard
Health", "Nightly Compliance & Perf", "Auto-QA Agent/Tuner", "Nil Safety", "GA4 Error
Monitor", "OpenSSF Scorecard", "Weekly Coverage Review", "Release", and "Build and
Deploy KC"), `upgrade-smoke.yml` has neither an internal issue-creation step nor an
entry in that catch-all's `workflows:` list. A break in the self-upgrade endpoint or a
pod that never becomes healthy after the upgrade trigger currently goes undetected by
anyone not actively watching the Actions tab.

## Detecting a Failure Today

Until the fix lands, check manually:

```bash
gh run list --repo kubestellar/console --workflow=upgrade-smoke.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` means a scheduled canary run
failed with no automated notification having been sent.

## Proposed Fix

Add `"In-Place Upgrade Smoke"` to the `workflows:` list in
`.github/workflows/workflow-failure-issue.yml` (the exact `name:` field value from
`upgrade-smoke.yml`). This is the smallest change: it reuses the catch-all's existing
dedup-by-title-and-label logic and comment-on-recurring-failure behavior, requiring no
new code path. No other change to `upgrade-smoke.yml` itself is needed.

The tracking issue also lists 12 other scheduled workflows in the same gap class
(`nightly-ux-journeys.yml`, the four `perf-*.yml` regression gates, `route-smoke.yml`,
`console-live-macos-canary.yml`, `mission-control-kind-e2e.yml`,
`accm-history-update.yml`, `cleanup-screenshots.yml`, `stuck-detection.yml`,
`ui-ux-standard.yml`); a maintainer applying this fix may want to add all of them to
the same `workflows:` list in one pass.

## Escalation

If a scheduled `upgrade-smoke.yml` run is found to have failed and gone unnoticed,
treat it as a P1: it indicates the self-upgrade path for all deployed console
instances may be broken. Reproduce locally per the workflow's own steps (build image,
`kind create cluster`, Helm install baseline, trigger upgrade, poll for healthy pod)
before assuming a flaky CI environment.
