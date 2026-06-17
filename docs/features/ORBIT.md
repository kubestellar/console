# Orbit Recurring Missions

Orbit is KubeStellar Console's recurring mission system for proactive cluster maintenance. Unlike one-time install or fix missions, Orbit missions are saved maintenance routines that run on a schedule and keep multi-cluster environments healthy over time.

## What Orbit does

Orbit missions are designed for day-2 operations:

- scheduled health checks across one or more clusters
- recurring certificate rotation reviews
- version drift detection for charts and images
- backup verification
- resource quota monitoring

The mission model supports `daily`, `weekly`, and `monthly` cadences, per-cluster targeting, optional resource scoping, last-run status, and run history.

## How Orbit fits into the console

Orbit is the recurring-maintenance layer in the mission system:

- **Install missions** deploy software
- **Fix missions** diagnose and remediate issues
- **Mission Control** coordinates multi-project rollout flows
- **Orbit** keeps those deployments healthy after rollout

Orbit can be created in two ways:

1. **After a Mission Control or install flow** using the Orbit setup offer, which can also generate a Ground Control dashboard for the deployed projects.
2. **As a standalone recurring mission** using the Orbit dialog, where an operator chooses the template, cadence, clusters, and scope directly.

## Built-in recurring mission templates

The current Orbit templates are:

| Orbit type | Default use |
| --- | --- |
| `health-check` | Verify pod readiness, service endpoints, and resource availability |
| `cert-rotation` | Review TLS certificate expiry and issuer readiness |
| `version-drift` | Compare deployed chart and image versions with newer releases |
| `resource-quota` | Watch namespace quota usage and approaching exhaustion |
| `backup-verification` | Confirm backup jobs complete and backup data is usable |

These templates are category-aware, so project selections can be used to suggest relevant recurring maintenance routines automatically.

## How to create and configure an Orbit mission

When creating an Orbit mission, configure:

1. **Template / orbit type** — choose the recurring maintenance routine.
2. **Cadence** — `daily`, `weekly`, or `monthly`.
3. **Target clusters** — one cluster or a fleet of clusters.
4. **Resource scope** — optionally limit the mission to specific Kubernetes resource kinds and namespaces per cluster.
5. **Auto-run** — automatically execute the mission when it becomes due while the console is open.

Saved Orbit missions retain:

- target clusters
- optional project context from Mission Control
- run history
- last-run timestamp and result
- optional link to the generated Ground Control dashboard

## Proactive multi-cluster health checks

Orbit is especially useful for proactive multi-cluster health checks. A weekly health-check mission can:

- scan every selected cluster for unhealthy pods
- verify service endpoints are populated
- surface quota pressure before workloads fail
- record warnings or failures in run history for follow-up

This turns the console from a reactive dashboard into a proactive operations surface. Instead of waiting for an outage, operators can schedule recurring checks for drift, expiry, or degraded health across their fleet.

## Auto-run behavior

Auto-run is intentionally conservative:

- Orbit missions execute automatically only when they are due
- auto-run happens while the console is open
- overdue missions run on the next visit instead of being skipped
- mission history is capped so recent recurring activity stays visible without unbounded growth

## Recommended operational pattern

A common workflow is:

1. deploy or update a project with Mission Control
2. create one or more Orbit missions for that project
3. enable a Ground Control dashboard
4. review recurring results and warnings over time

That pattern gives teams a closed loop: deploy, observe, and maintain the same multi-cluster workload from one console.
