# ACMM Level Monitor — False Regressions and No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/acmm-level-monitor.yml`

---

## Current Status

**No workflow-level fix is merged for either gap below.** The `operations` agent's
GitHub App token lacks the `workflows` permission required to create or update any
file under `.github/workflows/` (confirmed in prior sessions; see
`docs/runbooks/mttr-badge-no-alert.md`). Until a maintainer with that permission
applies the fixes described here, both gaps remain open. See tracking issues
[#23233](https://github.com/kubestellar/console/issues/23233) (false regressions)
and [#23235](https://github.com/kubestellar/console/issues/23235) (no job-failure
alert).

## Why This Matters

`acmm-level-monitor.yml` ("ACMM Level Monitor") runs daily at `0 8 * * *` and is the
only automated check that the public ACMM badge on the README hasn't regressed. It
has two independent gaps:

### Gap 1 — badge-endpoint outages reported as false code regressions (#23233)

The "Fetch ACMM badge score" step does `curl -sf ... || echo ""`. If the curl fails
(network blip, endpoint outage, non-2xx response) it falls into the empty-response
branch, which sets `level=0` and `message=badge endpoint unreachable`, then
proceeds exactly as if the repo had regressed to level 0. Because `min_level`
defaults to `5`, `0 < 5` is always true, so the workflow opens (or comments on) a
public `🔴 ACMM regression: badge dropped to L0` issue — even though nothing in the
repo tree changed. This is a false positive that misdiagnoses an availability
problem in `console.kubestellar.io`'s badge endpoint as a code regression, and
sends readers to investigate "which criteria are now missing" for a regression
that never happened.

### Gap 2 — no failure alert if the job itself errors (#23235)

Separately, if the job fails to execute at all (e.g. the `python3` parsing steps
error out, `gh issue create`/`gh issue comment` fails due to auth or rate-limit, or
the runner has an infra problem), there is no internal issue-creation-on-failure
step for that case, and `acmm-level-monitor.yml` is not listed in
`.github/workflows/workflow-failure-issue.yml`'s `workflow_run` catch-all
`workflows:` list. A genuine ACMM level regression could then go completely
undetected — worse than Gap 1, since here there is no alert at all, correct or
otherwise.

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

## Proposed Fix

**Gap 1:** In the "Fetch ACMM badge score" step, distinguish "endpoint unreachable"
from "endpoint reported a low level." On empty/failed `curl` response, set a
separate output (e.g. `endpoint_unreachable=true`) and skip the regression-issue
steps entirely (or open a distinctly labeled/worded issue, e.g. "ACMM badge
endpoint unreachable" without `acmm-regression`) instead of synthesizing
`level=0` and following the same regression path as a real drop.

**Gap 2:** Add `"ACMM Level Monitor"` (the exact `name:` field value) to the
`workflows:` list in `.github/workflows/workflow-failure-issue.yml`. This reuses
the catch-all's existing dedup-by-title-and-label logic and comment-on-recurring-
failure behavior — no new code path, and no other change to
`acmm-level-monitor.yml` itself is needed for the job-failure case.

## Escalation

Lower severity than a user-facing canary (this is a repo-hygiene/reporting job, not
production traffic). If an `acmm-regression` issue was opened automatically,
manually verify against the badge URL above before treating it as real — closing a
false positive without checking risks masking a genuine future regression under
alert fatigue. If a scheduled run failed outright (Gap 2), re-run it via
`workflow_dispatch` once the underlying cause is resolved.
