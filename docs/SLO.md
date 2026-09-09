# Service Level Objectives — kubestellar/console

This document defines Service Level Indicators (SLIs) and proposed Service Level
Objectives (SLOs) for the console's own operational endpoints and scheduled
canaries. **No monitoring backend is confirmed for this deployment.** The
numeric targets below are recommendations for an operator to adopt (e.g. via
their own Prometheus/Alertmanager scraping `/metrics`) — this document does not
wire up an exporter or external data flow, and no target here should be read as
already enforced.

## Service Description

`kubestellar/console` is a Fiber-based Go API server (`pkg/api`) plus a React
frontend, deployed standalone or in-cluster. It exposes `/healthz` (liveness),
`/health` (readiness + UI config), `/api/version` (build metadata), and
`/metrics` (Prometheus-format HTTP request counters/latency, see
`pkg/api/metrics/metrics.go`).

## SLIs and SLOs

### SLO 1 — API Liveness

**SLI:** Proportion of `/healthz` probe requests that return HTTP 200.

**Measurement:** `/healthz` (`pkg/api/routes_health.go`) returns 200 with
`{"status":"ok"}` unless the process is in `shuttingDown` state, in which case
it returns 503 by design so load balancers and k8s liveness/readiness probes
stop routing new traffic to a draining pod.

**Objective (proposed):**

| Window | Target |
|--------|--------|
| 30-day rolling | ≥ 99.5% of liveness probes return 200 |

**Exclusions:** Intentional 503s during graceful shutdown are excluded — they
are correct behavior, not an outage.

---

### SLO 2 — Cluster Connectivity Health

**SLI:** Proportion of time `/health` reports `"status":"ok"` rather than
`"status":"degraded"`.

**Measurement:** `/health` sets `status: "degraded"` when no configured
cluster in `k8sClient.GetCachedHealth()` has `Reachable: true` (see
`pkg/api/routes_health.go`). This reflects the console's ability to reach at
least one managed cluster, not the console process's own liveness.

**Objective (proposed):** ≥ 99% "ok" over a 30-day rolling window, excluding
windows where the operator has zero clusters configured (not applicable).

**Exclusions:** Failures attributable to a target cluster's own API server
being down are a cluster-side issue, not a console defect, but should still
count toward this SLI since it measures user-visible dashboard usability.

---

### SLO 3 — Self-Upgrade Canary Success

**SLI:** Proportion of scheduled `upgrade-smoke.yml` ("In-Place Upgrade
Smoke") runs that pass, exercising the full self-upgrade path (build, Helm
install, `/api/self-upgrade/trigger`, poll for healthy pod).

**Measurement:** `gh run list --repo kubestellar/console
--workflow=upgrade-smoke.yml`. This canary is described in its own workflow
header as "the gold-standard canary for the self-upgrade mechanism" — a
failure indicates every deployed console instance's upgrade path may be
broken.

**Objective (proposed):** 100% of scheduled runs pass; any scheduled failure
is a P1 per the escalation guidance in
[`runbooks/upgrade-smoke-no-alert.md`](runbooks/upgrade-smoke-no-alert.md).

**Known gap:** this canary currently has no automated failure alert (see the
linked runbook and tracking issue #23144) — until that is fixed, this SLO can
only be checked manually.

---

### SLO 4 — Auth Login Contract

**SLI:** Proportion of scheduled `auth-login-smoke.yml` runs that pass,
verifying the `#6590`/`#10398` auth cookie and kc-agent token contracts.

**Measurement:** `gh run list --repo kubestellar/console
--workflow=auth-login-smoke.yml`. A failure means either the JWT cookie
contract or kc-agent token propagation is broken — both are on the critical
path for every authenticated user.

**Objective (proposed):** 100% of scheduled runs pass.

---

### SLO 5 — Main Branch CI Recovery

**SLI:** Time from main-branch CI failure detection to a green main branch.

**Measurement and objective:** already defined in
[`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md) (4-hour recovery target). Not
duplicated here — see that document for the full playbook, and
[`runbooks/incident-response-automation-missing.md`](runbooks/incident-response-automation-missing.md)
for the current state of its automated detection.

## Alerting Guidance

None of the SLOs above are currently wired to an alerting backend; `/metrics`
is scraped only by an operator's own Prometheus if they choose to do so. An
operator adopting these targets should alert on:

- `/healthz` returning non-200 for more than 1 consecutive scrape interval.
- `/health` `status` field being `"degraded"` for more than 5 minutes.
- A `schedule`-triggered failure of `upgrade-smoke.yml` or
  `auth-login-smoke.yml` (see the linked runbooks for manual detection until
  the automated alert gaps tracked in #23144 are closed).

This guidance is informational only — it does not add an exporter, dashboard,
or external data flow to this repository.
