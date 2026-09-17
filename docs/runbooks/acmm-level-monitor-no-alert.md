# ACMM Level Monitor — False Regressions and No Failure Alert Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/acmm-level-monitor.yml`

---

## Current Status

**Both gaps are fixed.** Gap 1: the "Fetch ACMM badge score" step now sets a
separate `unreachable` output and opens a distinctly-labeled
`acmm-monitor-unreachable` issue instead of following the regression path when
the badge endpoint can't be reached. Gap 2: `"ACMM Level Monitor"` was added to
the `workflows:` catch-all in `.github/workflows/workflow-failure-issue.yml`
(PR [#23525](https://github.com/kubestellar/console/pull/23525)), so a job
failure now opens/updates a tracked issue automatically. Tracking issues
[#23233](https://github.com/kubestellar/console/issues/23233) (false regressions)
and [#23235](https://github.com/kubestellar/console/issues/23235) (no job-failure
alert) are both closed. The detail below is kept as a manual-verification
fallback.

## Why This Matters

`acmm-level-monitor.yml` ("ACMM Level Monitor") runs daily at `0 8 * * *` and is the
only automated check that the public ACMM badge on the README hasn't regressed. It
has two independent gaps:

### Gap 1 — badge-endpoint outages reported as false code regressions (#23233, fixed)

The "Fetch ACMM badge score" step does `curl -sf ... || echo ""`. Previously, if
the curl failed (network blip, endpoint outage, non-2xx response) it fell into
the empty-response branch, which set `level=0` and `message=badge endpoint
unreachable`, then proceeded exactly as if the repo had regressed to level 0.
This was a false positive that misdiagnosed an availability problem in
`console.kubestellar.io`'s badge endpoint as a code regression. The step now
sets `unreachable=true` and opens a distinct `acmm-monitor-unreachable`-labeled
issue instead of the regression path.

### Gap 2 — no failure alert if the job itself errors (#23235, fixed)

Separately, if the job fails to execute at all (e.g. the `python3` parsing steps
error out, `gh issue create`/`gh issue comment` fails due to auth or rate-limit, or
the runner has an infra problem), there was no internal issue-creation-on-failure
step for that case, and `acmm-level-monitor.yml` was not listed in
`.github/workflows/workflow-failure-issue.yml`'s `workflow_run` catch-all
`workflows:` list. `"ACMM Level Monitor"` is now on that list, so a job failure
opens/updates a tracked issue via the catch-all.

## Detecting a Failure or False Positive Today

```bash
gh run list --repo kubestellar/console --workflow=acmm-level-monitor.yml --limit 10
```

- A `conclusion: failure` entry with `event: schedule` means Gap 2: the scheduled
  check failed to execute, with no automated notification sent.
- A `conclusion: success` run that nonetheless opened or commented on an
  `acmm-regression`-labeled issue may be Gap 1 — cross-check by re-running the
  badge URL manually:

```bash
curl -sf "https://console.kubestellar.io/api/acmm/badge?repo=kubestellar%2Fconsole&force=true"
```

If this curl also fails or times out, the endpoint was down at alert time and the
open `acmm-regression` issue is very likely a false positive from Gap 1, not a real
drop in ACMM criteria. If it succeeds and reports a level below `min_level`, treat
the alert as a genuine regression.

## Proposed Fix (applied)

**Gap 1:** In the "Fetch ACMM badge score" step, distinguish "endpoint unreachable"
from "endpoint reported a low level." On empty/failed `curl` response, set a
separate output (`unreachable=true`) and skip the regression-issue
steps entirely, opening a distinctly labeled/worded issue instead
(`acmm-monitor-unreachable`) — done.

**Gap 2:** Add `"ACMM Level Monitor"` (the exact `name:` field value) to the
`workflows:` list in `.github/workflows/workflow-failure-issue.yml` — done, via
PR #23525.

## Escalation

Lower severity than a user-facing canary (this is a repo-hygiene/reporting job, not
production traffic). If an `acmm-regression` issue was opened automatically,
manually verify against the badge URL above before treating it as real — closing a
false positive without checking risks masking a genuine future regression under
alert fatigue. If a scheduled run failed outright (Gap 2), re-run it via
`workflow_dispatch` once the underlying cause is resolved.
