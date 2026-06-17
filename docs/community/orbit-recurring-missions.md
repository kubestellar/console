# Orbit Recurring Missions

> Scheduled proactive multi-cluster health checks powered by the Stellar runtime.

## Overview

Orbit is the recurring mission subsystem of the KubeStellar Console. It enables operators to define missions that execute on a schedule — proactively detecting drift, verifying compliance, and surfacing health issues before they become incidents.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Orbit Scheduler (CronJob-style triggers)   │
├─────────────────────────────────────────────┤
│  Mission Executor (Stellar runtime)          │
│  ├── Context Assembly (cluster state)        │
│  ├── Tool Invocation (kubectl, helm, etc.)   │
│  └── Result Persistence (SQLite + timeline)  │
├─────────────────────────────────────────────┤
│  Notification Pipeline                       │
│  ├── Escalation (Stellar notifications)      │
│  ├── Slack / PagerDuty / OpsGenie            │
│  └── Timeline activity log                   │
└─────────────────────────────────────────────┘
```

## Mission Types

| Type | Frequency | Example |
|------|-----------|---------|
| Health Check | Every 5 min | Pod restart detection across clusters |
| Compliance Scan | Hourly | RBAC drift detection, PSA enforcement |
| Resource Audit | Daily | Orphaned PVCs, idle deployments |
| Security Sweep | On-demand + scheduled | CVE impact assessment |
| Cost Analysis | Weekly | Right-sizing recommendations |

## Defining a Recurring Mission

```yaml
apiVersion: kc-mission-v1
kind: RecurringMission
metadata:
  name: pod-restart-detector
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  clusters: ["*"]           # All connected clusters
  mission:
    description: "Detect pods with >3 restarts in the last hour"
    steps:
      - tool: kubectl
        args: ["get", "pods", "--all-namespaces", "-o", "json"]
        filter: ".items[] | select(.status.containerStatuses[]?.restartCount > 3)"
    escalation:
      severity: warning
      notify: ["stellar-notifications"]
```

## Community Engagement

### Why This Matters

- **Proactive vs Reactive**: Traditional monitoring alerts AFTER failures. Orbit catches issues BEFORE they cascade.
- **Multi-cluster native**: A single recurring mission runs across all connected clusters simultaneously.
- **AI-enhanced**: Stellar's LLM integration can analyze patterns and suggest remediations.

### Getting Started

1. Browse existing missions: `console.kubestellar.io` → Missions → Browse
2. Fork and customize: Missions are YAML — fork, edit, PR back
3. Create your own: Follow the [card development guide](../marketplace/card-development-guide.md)

### Roadmap

- [ ] Orbit UI panel in console dashboard
- [ ] Visual mission builder (drag-and-drop steps)
- [ ] Mission marketplace integration (share recurring missions)
- [ ] Prometheus alert → Orbit mission auto-generation
- [ ] Cross-cluster correlation (detect cascading failures)

## Related

- [Stellar Architecture](../../stellar/architecture.md)
- [Mission Validation API](../../README.md)
- [console-kb Mission Library](https://github.com/kubestellar/console-kb)
