# ACMM Level Monitor — False Regression Diagnosis Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/acmm-level-monitor.yml`

---

## Current Status

**No workflow-level fix is merged.** The `operations` agent's GitHub App token lacks
the `workflows` permission required to create or update any file under
`.github/workflows/` (confirmed in prior sessions; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Until a maintainer with that permission
applies the fix below, an endpoint outage is reported as, and indistinguishable
from, a genuine ACMM regression. See tracking issue
[#23233](https://github.com/kubestellar/console/issues/23233).

## Why This Matters

`acmm-level-monitor.yml` ("ACMM Level Monitor", daily `0 8 * * *`) conflates two
unrelated failure modes in its "Fetch ACMM badge score" step:

1. **Real regression** — the badge endpoint responds and the parsed level is
   genuinely below `min_level`.
2. **Endpoint unreachable** — `curl -sf` fails (network blip, outage, or an API
   contract change).

On a `curl` failure the step hard-codes `level=0`, which is always below the
default `min_level` of `5`. That falls straight into the same "Open regression
issue" / "Comment on existing issue" steps used for a genuine drop, producing a
`🔴 ACMM regression: badge dropped to L0` message even though the real cause is
"the endpoint didn't respond." On-call is pointed at the wrong root cause
(searching the repo tree for missing criteria) instead of checking endpoint
health — wasted investigation time during exactly the kind of outage this monitor
exists to catch. This is distinct from
[#23235](https://github.com/kubestellar/console/issues/23235) (no alert at all if
the job itself errors) — that fix does not correct this misdiagnosis, and this fix
does not add failure-of-the-job alerting.

## Detecting This Today

```bash
gh run list --repo kubestellar/console --workflow=acmm-level-monitor.yml --limit 10
```

Open any auto-filed `acmm-regression` issue and check the workflow run log for the
"Fetch ACMM badge score" step. If it printed `badge endpoint unreachable` /
`message=badge endpoint unreachable`, the regression report is a **false positive**
caused by an outage, not a real ACMM level drop — verify by curling the endpoint
directly:

```bash
curl -sf "https://console.kubestellar.io/api/acmm/badge?repo=kubestellar%2Fconsole&force=true"
```

If that also fails, treat it as an endpoint-health incident, not a repo regression.

## Proposed Fix

Track a distinct `unreachable` output from the fetch step and gate the existing
regression-issue steps on `unreachable == 'false'`. When unreachable, open/update a
separate issue (e.g. labeled `acmm-monitor-unreachable`) that correctly states
"endpoint unreachable, level check skipped" and points at endpoint health instead of
the repo tree. This does not weaken or remove alerting for either failure mode —
both still page on-call — it only fixes which alert fires and what it tells the
responder to check. See issue #23233 for a complete diff implementing this change
against `acmm-level-monitor.yml`.

## Escalation

If the badge endpoint has been unreachable for more than one scheduled run (24h),
escalate as a P2 endpoint-health incident — a persistent outage also means any real
ACMM regression during that window would go undetected once the fix above is
applied (the unreachable path intentionally skips the regression check).
