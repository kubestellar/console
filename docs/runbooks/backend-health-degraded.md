# Runbook: `/health` reports `degraded` or `/watchdog/ready` returns `not_ready`

This runbook covers triage when the console backend reports a
non-`ok` status through any of its health surfaces:

- `GET /health` — `pkg/api/routes_health.go`. `status` is `"degraded"`
  when no managed cluster in the health cache is reachable, `"ok"`
  otherwise (or `"shutting_down"` mid-drain).
- `GET /healthz` — minimal liveness probe. Only reflects process
  shutdown state, **not** cluster reachability.
- `GET /watchdog/health` / `GET /watchdog/ready` — `pkg/watcher/watcher.go`.
  The watchdog proxy in front of the backend. `ready` is `not_ready`
  (HTTP 503) whenever the watchdog's own poll of the backend `/health`
  endpoint last failed to connect — this reflects **backend process
  reachability**, not cluster reachability. A backend that is up but
  reporting `degraded` clusters still passes `/watchdog/ready`.

These three layers are independent and answer different questions.
Confusing them was the root cause of several past incidents — see
"Prior incidents" below.

## Quick decision tree

1. **`/watchdog/ready` returns 503 (`not_ready`)** → the backend
   process itself is unreachable from the watchdog (crashed, still
   starting, or OOM-killed). This is a liveness/restart problem, not a
   cluster-connectivity problem.
   - Check pod status: `kubectl get pods -l app=kubestellar-console -o wide`.
   - Check backend logs for panics or OOM: `kubectl logs <pod> -c console --previous`.
   - Check `/watchdog/health` for `stage` (`backend_starting`, `ready`,
     etc.) and `fallbacks_served` to see how long the backend has been down.

2. **`/watchdog/ready` returns 200 but `GET /health` returns
   `"status": "degraded"`** → the backend process is healthy, but the
   `MultiClusterClient` health cache (`pkg/k8s/client_health.go`) has
   no cluster marked `Reachable: true`.
   - This does **not** mean the console itself is down. Do not treat
     `degraded` as equivalent to `not_ready` (see #5401).
   - Query per-cluster detail: `GET /api/mcp/clusters/health` (or the
     `Providers` panel in the UI) to see which cluster(s) are
     unreachable and why (`ErrorType`: `auth`, `config`, `timeout`,
     network).
   - Common causes: kubeconfig context stale/expired credentials,
     managed cluster API server unreachable, or a slow cluster that
     exceeded `perClusterHealthTimeout` (`GetAllClusterHealth`,
     `pkg/k8s/client_health.go`).
   - If every context is genuinely unreachable, confirm this is
     expected (e.g. a demo/local install with no clusters attached)
     before escalating — `degraded` is the correct state in that case.

3. **`GET /health` returns `"ok"` but users report a lockout screen
   ("Compiling Backend...")** → check the frontend is actually polling
   `/health`/`/healthz` and not stuck on a cached `starting` stage from
   before a restart (`pkg/api/middleware_setup.go` polls `/healthz`
   during dev-server startup). Confirm `stage` in `/watchdog/health` is
   `ready`, not `backend_starting`.

## What NOT to do

- Do not "fix" a `degraded` incident by making `/health` always return
  `ok` — that reintroduces #5221 (health reported `ok` while every
  cluster was unreachable) and hides real connectivity loss from
  users and from anything polling this endpoint.
- Do not treat `degraded` (cluster-level) and `not_ready`
  (process-level) as interchangeable when writing alerts or triage
  notes — see #5401 for the incident this caused.

## Prior incidents referenced by this runbook

- #5804 — permanent "Compiling Backend..." UI lockout when 0 clusters
  were reachable.
- #5221 — `/health` reported `ok` even when all clusters were
  unreachable.
- #5837 — console stuck on "Compiling backend" with `/health`
  returning `degraded` and 503 on OAuth startup.
- #5401 — a `degraded` backend was treated as "down," flipping users
  into demo mode unexpectedly.
- #8162 — backend API 503 failures were not reflected in dashboard
  health status.

If you resolve a new incident that surfaces through these endpoints,
add it to this list and update the decision tree above so the next
on-call doesn't have to rediscover the same distinction.
