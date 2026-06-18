---
title: "Orbit Recurring Missions"
linkTitle: "Orbit Missions"
weight: 40
description: >
  Schedule autonomous AI-driven maintenance tasks that run continuously across your multi-cluster fleet — health checks, cert rotation, capacity planning, and drift detection — without manual intervention.
keywords:
  - orbit
  - recurring missions
  - autonomous maintenance
  - cluster health
  - cert rotation
  - capacity planning
  - drift detection
  - scheduled tasks
---

## What Is Orbit?

**Orbit** is KubeStellar Console's recurring-mission engine. Where a standard AI mission runs once on demand, an Orbit mission runs on a schedule — every hour, every night, every week — across every cluster in your fleet.

Orbit missions are ideal for operational tasks that must happen regularly but are tedious to run by hand:

| Use case | Example schedule |
|----------|-----------------|
| TLS/cert audit | Nightly at 02:00 UTC |
| Capacity headroom check | Every 6 hours |
| Version-drift scan | Weekly on Sunday |
| Policy compliance sweep | Daily |
| Node readiness probe | Every 15 minutes |
| Namespace garbage collection | Weekly |

Each run produces a structured execution report you can review in the console, forward to Slack, or export to an audit trail.

---

## Getting Started

### Prerequisites

- KubeStellar Console v0.19 or later
- At least one connected cluster
- An AI provider configured (Settings → AI Providers)
- The `orbit` feature flag enabled (enabled by default in v0.19+)

### Create Your First Orbit Mission

1. Open the console and navigate to **Missions → Orbit**.
2. Click **New Orbit Mission**.
3. Fill in the mission form:

   | Field | Description |
   |-------|-------------|
   | **Name** | Short identifier, e.g. `nightly-tls-audit` |
   | **Description** | What the mission checks or fixes |
   | **Schedule (cron)** | Standard cron expression, e.g. `0 2 * * *` |
   | **Target clusters** | All clusters, a label selector, or a named list |
   | **Remediation level** | `report-only`, `suggest`, or `auto-remediate` |
   | **Prompt** | Natural-language instructions for the AI agent |

4. Click **Save and Activate**.

The mission moves to **Active** status and will execute on its next scheduled trigger.

### Example: Nightly TLS Audit

```
Name:        nightly-tls-audit
Schedule:    0 2 * * *
Clusters:    all
Remediation: report-only
Prompt: >
  Inspect every TLS Secret and Certificate resource across all namespaces.
  Flag any certificate expiring within 30 days.
  Report the certificate name, namespace, cluster, expiry date, and issuer.
  Do not modify any resources.
```

---

## Common Use Cases

### 1. Nightly TLS/Certificate Audit

Certificates that expire silently are one of the most common causes of production outages. An Orbit mission can audit every `Certificate` (cert-manager) and `Secret` of type `kubernetes.io/tls` nightly and surface anything expiring in the next 30 days before it becomes an incident.

**Prompt template:**

```
Scan all namespaces across all clusters for TLS Secrets and cert-manager Certificate
resources expiring within {{DAYS}} days. For each finding, report:
- Cluster name
- Namespace
- Resource name and type
- Expiry date
- Issuer (if available)
Output a markdown table sorted by expiry date ascending.
```

---

### 2. Capacity Headroom Check

Avoid surprise OOMKilled pods by running a capacity check every 6 hours. The agent inspects node allocatable resources against running workload requests and flags nodes approaching a configurable threshold.

**Prompt template:**

```
For every node in every connected cluster, calculate CPU and memory utilization
as (requested / allocatable). Flag any node where either metric exceeds 80 %.
Include pod count, top-3 resource consumers by namespace, and a recommendation
(drain candidate / add node / reschedule workloads).
```

---

### 3. Version Drift Scan

In a multi-cluster fleet, container image versions and Helm chart revisions can diverge over time. A weekly drift scan compares versions across clusters and highlights inconsistencies.

**Prompt template:**

```
Compare Deployment image tags and Helm release versions across all clusters.
Identify any resource whose image tag or chart version differs between clusters.
Group findings by workload name and list the version on each cluster.
Suggest which cluster should be treated as the source of truth based on recency.
```

---

### 4. Policy Compliance Sweep

Run a daily Kyverno or OPA policy audit to catch new violations introduced by recent deployments.

**Prompt template:**

```
List all Kyverno PolicyReport and ClusterPolicyReport resources across all clusters.
Summarize pass/fail counts per policy. Show the top 5 failing policies with
namespace and workload details. Flag any critical policies with non-zero failures.
```

---

## Architecture

### How Orbit Executes

```
Cron trigger
    │
    ▼
Orbit Scheduler ──► MissionExecution CR created
                          │
                          ▼
                    Stellar Core
                    (AI agent with tool access)
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Cluster A    Cluster B    Cluster C
         (kubectl)    (kubectl)    (kubectl)
              │           │           │
              └───────────┼───────────┘
                          ▼
                  Execution Report
                  (console + optional webhook)
```

Orbit missions run as **Stellar MissionExecution** objects inside the console backend. The AI agent receives tool access to every connected cluster via the kc-agent WebSocket bridge, executes the mission prompt, and produces a structured report.

### Parallelism

By default, Orbit runs cluster checks in parallel with a concurrency limit of 5. You can override this per mission:

```yaml
# In the mission YAML (advanced mode)
spec:
  clusterConcurrency: 10
  clusterTimeoutSeconds: 120
```

### Execution Phases

| Phase | Description |
|-------|-------------|
| **Scheduled** | Waiting for next cron trigger |
| **Initializing** | Context and memory loaded, tool bindings resolved |
| **Running** | AI agent executing tool calls against clusters |
| **Reporting** | Generating structured output |
| **Complete** | Execution archived; report available |
| **Failed** | Agent or tool error; see execution log |

---

## Remediation Levels

Orbit missions support three remediation modes. Choose carefully — higher modes grant the agent write access to your clusters.

### `report-only` (default)

The agent reads cluster state and generates a report. No resources are created, modified, or deleted. Safe for all use cases.

### `suggest`

The agent generates a report **and** a list of suggested `kubectl` commands or Helm invocations. A human must approve and run the suggestions. No automatic changes.

### `auto-remediate`

The agent reads cluster state, decides on corrective actions, and applies them directly. Actions are limited to the permission set in the mission's bound ServiceAccount.

> ⚠️ **Use `auto-remediate` only for well-understood, reversible operations.** Always test in a non-production cluster first. Every action is logged in the execution audit trail.

---

## Viewing Results

### Execution History

Navigate to **Missions → Orbit → [Mission Name] → History** to see all past executions with status, duration, and summary.

### Execution Report

Click any execution to open the full report, which includes:

- Executive summary (findings count, severity distribution)
- Per-cluster details
- Suggested or applied remediation actions
- Raw agent transcript (expandable)

### Notifications

Connect Orbit reports to Slack, PagerDuty, or any webhook in **Settings → Notifications**. Configure per-mission notification rules to alert only on findings above a severity threshold.

---

## Best Practices

### Write Precise Prompts

Vague prompts produce vague reports. Be specific about:
- What resources to inspect
- What thresholds to apply
- What output format you expect
- What the agent should **not** do

### Start with `report-only`

Always start a new Orbit mission in `report-only` mode. Review a few execution cycles before promoting to `suggest` or `auto-remediate`.

### Scope Cluster Targets

Use label selectors to limit missions to relevant clusters:

```yaml
clusterSelector:
  matchLabels:
    env: production
    region: us-east-1
```

### Set Reasonable Timeouts

Complex multi-cluster missions can run for several minutes. Set `clusterTimeoutSeconds` high enough to allow completion but low enough to surface hung executions.

### Archive Old Executions

Execution reports accumulate over time. Configure a retention policy in **Settings → Orbit** (default: 90 days).

### Test in Staging First

Before scheduling an `auto-remediate` mission on production, run it manually against a staging cluster using **Run Now** and review the full transcript.

---

## Troubleshooting

### Mission is not triggering

- Check the cron expression is valid. Use [crontab.guru](https://crontab.guru) to verify.
- Verify the mission status is **Active** (not **Paused** or **Error**).
- Check the Orbit scheduler logs: **Settings → Diagnostics → Orbit Scheduler**.

### Execution fails immediately

- Open the execution log and look for tool-binding or permission errors.
- Verify the kc-agent is connected for all target clusters (**Settings → Clusters**).
- Check that the AI provider is reachable (**Settings → AI Providers → Test Connection**).

### Partial results (some clusters missing)

- One or more clusters may be unreachable. Check the per-cluster status in the execution report.
- Increase `clusterTimeoutSeconds` if clusters are slow to respond.
- Review kc-agent connectivity for affected clusters.

### Report is empty or uninformative

- Review your prompt for ambiguity.
- Add explicit output format instructions ("Output a markdown table with columns: …").
- Check if the target resources exist on the clusters (`kubectl get <resource> -A`).

---

## Reference

### Orbit Mission YAML Schema

```yaml
apiVersion: console.kubestellar.io/v1alpha1
kind: OrbitMission
metadata:
  name: nightly-tls-audit
spec:
  schedule: "0 2 * * *"           # cron expression (UTC)
  enabled: true
  clusterSelector: {}              # empty = all clusters
  clusterConcurrency: 5
  clusterTimeoutSeconds: 300
  remediationLevel: report-only    # report-only | suggest | auto-remediate
  retentionDays: 90
  prompt: |
    Audit TLS certificates expiring within 30 days …
  notifications:
    - channel: slack-ops
      minSeverity: warning
```

### Schedule Shortcuts

| Shortcut | Equivalent cron | Description |
|----------|----------------|-------------|
| `@hourly` | `0 * * * *` | Every hour |
| `@daily` | `0 0 * * *` | Midnight UTC |
| `@weekly` | `0 0 * * 0` | Sunday midnight UTC |
| `@monthly` | `0 0 1 * *` | First of month |

---

## Related Topics

- [Stellar Architecture](../../stellar/architecture.md) — how the mission runtime works under the hood
- [ADOPTERS.md](https://github.com/kubestellar/console/blob/main/ADOPTERS.md) — organizations using KubeStellar Console
- [Community](https://kubestellar.io/community) — join the KubeStellar community
