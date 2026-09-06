# Remaining Scheduled Workflows — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** 12 scheduled workflows listed below (same mechanism gap as
`docs/runbooks/upgrade-smoke-no-alert.md`, `docs/runbooks/console-live-promote-no-alert.md`,
and `docs/runbooks/stale-workflow-no-alert.md`)

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (verified in prior sessions; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Until a maintainer with that permission
adds the fix described below, a scheduled failure of any workflow in this list
produces **no notification of any kind** — only a red run in the Actions tab. See
tracking issue [#23144](https://github.com/kubestellar/console/issues/23144).

## Why This Matters

Issue #23144 identified 13 cron-scheduled workflows with neither (a) an internal
issue-creation-on-failure step, nor (b) an entry in
`.github/workflows/workflow-failure-issue.yml`'s `workflow_run` catch-all. One of the
13 (`upgrade-smoke.yml`) already has its own dedicated runbook because of its severity
("gold-standard canary for the self-upgrade mechanism"). This runbook covers the
remaining 12, grouped by category, with a manual detection command for each.

### Performance regression gates (`cron: '*/2h'`, roughly)

| Workflow file | `name:` | Detect manually |
|---|---|---|
| `perf-bundle-size.yml` | Perf — Bundle size | `gh run list --repo kubestellar/console --workflow=perf-bundle-size.yml --limit 10` |
| `perf-react-commits.yml` | Perf — React commits per navigation | `gh run list --repo kubestellar/console --workflow=perf-react-commits.yml --limit 10` |
| `perf-react-commits-idle.yml` | Perf — React commits per second (idle) | `gh run list --repo kubestellar/console --workflow=perf-react-commits-idle.yml --limit 10` |
| `perf-ttfi.yml` | Performance TTFI Gate | `gh run list --repo kubestellar/console --workflow=perf-ttfi.yml --limit 10` |

A silent failure here means a real performance regression on `main` could ship
undetected until a user notices, since the gate that would normally catch it isn't
running (or its failure isn't being reported).

### UX / e2e canaries

| Workflow file | `name:` | Detect manually |
|---|---|---|
| `nightly-ux-journeys.yml` | Nightly UX Journey Tests | `gh run list --repo kubestellar/console --workflow=nightly-ux-journeys.yml --limit 10` |
| `route-smoke.yml` | Route & Modal Smoke Test | `gh run list --repo kubestellar/console --workflow=route-smoke.yml --limit 10` |
| `console-live-macos-canary.yml` | Console Live macOS Canary | `gh run list --repo kubestellar/console --workflow=console-live-macos-canary.yml --limit 10` |
| `mission-control-kind-e2e.yml` | Mission Control Kind E2E | `gh run list --repo kubestellar/console --workflow=mission-control-kind-e2e.yml --limit 10` |
| `ui-ux-standard.yml` | UI/UX Standards | `gh run list --repo kubestellar/console --workflow=ui-ux-standard.yml --limit 10` |

### Repo-hygiene / maintenance jobs (lowest severity)

| Workflow file | `name:` | Detect manually |
|---|---|---|
| `accm-history-update.yml` | ACCM History Update | `gh run list --repo kubestellar/console --workflow=accm-history-update.yml --limit 10` |
| `cleanup-screenshots.yml` | Cleanup Old Screenshots | `gh run list --repo kubestellar/console --workflow=cleanup-screenshots.yml --limit 10` |
| `stuck-detection.yml` | Stuck Detection Workflow | `gh run list --repo kubestellar/console --workflow=stuck-detection.yml --limit 10` |

A `conclusion: failure` entry with `event: schedule` in any of the commands above
means a scheduled run failed with no automated notification having been sent.

## Proposed Fix

Add all 12 `name:` values above (plus `"In-Place Upgrade Smoke"`,
`"Console Live Promote"`, and `"Stale Issues"`, which have their own dedicated
runbooks) to the `workflows:` list in
`.github/workflows/workflow-failure-issue.yml` in a single pass. This reuses the
catch-all's existing dedup-by-title-and-label and comment-on-recurring-failure logic
— no new code path is required, and no change to any of the 12 workflow files
themselves is needed.

## Escalation

Performance-gate failures (the four `perf-*.yml` workflows) should be treated with
higher urgency than the hygiene jobs: a missed regression there can ship to users.
Reproduce locally per each workflow's own steps before assuming a flaky CI
environment.
