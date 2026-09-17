# In-Place Upgrade Smoke — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/upgrade-smoke.yml`

---

## Current Status

**Alerting is wired up.** `"In-Place Upgrade Smoke"` — together with the 12 other
scheduled workflows in the same gap class — is listed in the `workflows:` trigger list
of `.github/workflows/workflow-failure-issue.yml`. A failed scheduled (or
`workflow_dispatch`) run now opens a `workflow-failure` labelled issue titled
`Workflow failure: In-Place Upgrade Smoke`, or comments on the existing open one if a
failure is already being tracked. See tracking issue
[#23144](https://github.com/kubestellar/console/issues/23144).

## Why This Matters

`upgrade-smoke.yml` ("In-Place Upgrade Smoke") is described in its own header comment
as "the gold-standard canary for the self-upgrade mechanism," warning that "If this
workflow fails on main, every deployed console instance's upgrade path is potentially
broken." It runs on a 6-hour cron (`17 */6 * * *`) and exercises the full self-upgrade
path: build baseline/head images, install via Helm into a Kind cluster, trigger
`/api/self-upgrade/trigger`, and verify the upgraded pod becomes healthy.

`upgrade-smoke.yml` has no internal issue-creation step of its own (unlike
`nightly-dashboard-health.yml`); it relies entirely on the generic
`workflow-failure-issue.yml` catch-all. A break in the self-upgrade endpoint or a pod
that never becomes healthy after the upgrade trigger is therefore only detected if
that catch-all lists this workflow by name.

## Detecting a Failure

A failed scheduled run opens (or comments on) an issue:

```bash
gh issue list --repo kubestellar/console --label workflow-failure --state open
```

To inspect the underlying runs directly:

```bash
gh run list --repo kubestellar/console --workflow=upgrade-smoke.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` should have a corresponding
`workflow-failure` issue. If it does not, the catch-all itself is broken — check the
"Open Issue on Workflow Failure" workflow's own runs.

## How The Alert Is Wired

`.github/workflows/workflow-failure-issue.yml` is a `workflow_run`-triggered catch-all.
It matches on the exact `name:` field value of each monitored workflow — for this
canary, `In-Place Upgrade Smoke` from `upgrade-smoke.yml`. It reuses one
dedup-by-title-and-label code path for every monitored workflow, so no per-workflow
issue-creation step is needed.

**If you rename a workflow, update its entry in that list** — the trigger matches by
name, so a rename silently drops alerting.

The same list also covers the 12 other scheduled workflows originally reported in the
same gap class: `nightly-ux-journeys.yml`, the four `perf-*.yml` regression gates,
`route-smoke.yml`, `console-live-macos-canary.yml`, `mission-control-kind-e2e.yml`,
`accm-history-update.yml`, `cleanup-screenshots.yml`, `stuck-detection.yml`, and
`ui-ux-standard.yml`.

## Escalation

If a scheduled `upgrade-smoke.yml` run fails, treat the resulting
`workflow-failure` issue as a P1: it indicates the self-upgrade path for all deployed console
instances may be broken. Reproduce locally per the workflow's own steps (build image,
`kind create cluster`, Helm install baseline, trigger upgrade, poll for healthy pod)
before assuming a flaky CI environment.
