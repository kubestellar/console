# Set It and Forget It: Proactive Cluster Maintenance with KubeStellar Console Orbit

*June 2026*

Multi-cluster Kubernetes operators face a common problem: by the time you **notice** a certificate is about to expire, a persistent volume is filling up, or a security policy has drifted, you are already in firefighting mode. Traditional dashboards show you what is broken **right now**. But what if your console could **proactively check** for problems on a schedule and alert you before they become incidents?

That is what **Orbit** does.

---

## What Is Orbit?

Orbit is KubeStellar Console's recurring mission subsystem. It lets you schedule **AI-powered cluster maintenance tasks** to run automatically — nightly, weekly, or on any cron schedule you choose.

Think of Orbit as **cron for cluster operations**, except instead of shell scripts, you get:

- **AI-powered diagnostics** — missions that analyze cluster state, detect drift, and identify risks
- **Multi-cluster scope** — a single Orbit mission can run across all your clusters in parallel
- **Observable execution** — every run streams logs, progress, and outcomes to the console
- **Actionable alerts** — when Orbit finds an issue, it creates an alert with full context and recommended fixes

---

## Use Cases

### 1. Nightly TLS Certificate Expiry Checks

TLS certificates expire. Kubernetes admission webhooks, ingress controllers, and service meshes all depend on valid certificates. An expired cert can take down your entire cluster.

With Orbit, you can schedule a mission that checks **every certificate in every cluster** for expiry within the next 30 days and alerts you before the problem hits production.

**Example mission**: [Nightly TLS certificate expiry check](https://console.kubestellar.io/missions/orbit/tls-expiry-check)

### 2. Capacity Planning Scans

Nodes running out of disk space, pods hitting memory limits, and PersistentVolumes at 90% capacity — these are predictable problems. Orbit missions can scan for resource pressure across all clusters and file alerts when thresholds are crossed.

### 3. Security Policy Drift Detection

Your production clusters should match your baseline security policies. But over time, manual changes, emergency patches, and configuration drift accumulate. An Orbit mission can run a weekly compliance scan (NetworkPolicies, PodSecurityStandards, RBAC baselines) and flag deviations.

### 4. Helm Release Upgrade Checks

New versions of your Helm charts are released constantly. An Orbit mission can check for available upgrades, compare current vs. latest versions, and notify you when it is time to upgrade.

---

## How It Works

1. **Define the mission** — choose an existing mission template or create a custom one with your own checks
2. **Set the schedule** — use a cron expression (`0 2 * * *` for 2am daily) or a simple interval (`every 24h`)
3. **Configure scope** — run on all clusters, specific clusters, or clusters matching a label selector
4. **Activate** — Orbit takes over and runs the mission on schedule

Every execution:

- Streams logs and progress to the console in real-time
- Surfaces findings as alerts in the dashboard
- Stores results for historical trend analysis

---

## Demo: Nightly TLS Certificate Expiry Check

Here is how you would set up a recurring mission to check for expiring certificates across all your clusters:

1. Navigate to **Missions** → **Orbit** in the console
2. Click **Create Recurring Mission**
3. Select the **TLS Certificate Expiry Check** template
4. Configure:
   - **Name**: `nightly-cert-check`
   - **Schedule**: `0 2 * * *` (runs at 2am daily)
   - **Scope**: `All clusters`
   - **Alert threshold**: `Certificates expiring within 30 days`
5. Click **Activate**

The mission will now run every night at 2am. If it finds a certificate expiring soon, you will see an alert in the dashboard with:

- Which cluster has the cert
- Which namespace and secret
- How many days until expiry
- A one-click action to renew or rotate the certificate

---

## Why This Matters for AIOps

Orbit is part of a broader shift in Kubernetes operations: from **reactive dashboards** to **autonomous cluster maintenance**. Instead of waiting for alerts to fire and then scrambling to diagnose the root cause, Orbit runs proactive checks on your schedule and surfaces issues **before they escalate**.

This is the foundation of **AIOps** — operations that anticipate problems instead of just reacting to them.

---

## Try It Now

The Orbit subsystem is available in the latest version of KubeStellar Console. To get started:

1. **Self-hosted**: [Install the console](https://github.com/kubestellar/console#local-install-self-host) and navigate to **Missions** → **Orbit**
2. **Demo mode**: Visit [console.kubestellar.io/missions/orbit](https://console.kubestellar.io/missions/orbit) to see pre-configured Orbit missions in action (demo data only)

---

## What's Next

Orbit is still early, but the roadmap includes:

- **Custom mission builder** — define your own proactive checks with a visual workflow editor
- **Conditional execution** — run missions only when specific conditions are met (cluster version, resource usage, alert count)
- **Mission chaining** — trigger one mission based on the outcome of another
- **Cross-cluster orchestration** — coordinate multi-step workflows across clusters (e.g., rolling restart with health checks)

Orbit is the first step toward fully autonomous Kubernetes operations. We are building the runtime for operational tasks that never need manual intervention.

---

## Get Involved

- [KubeStellar Console on GitHub](https://github.com/kubestellar/console)
- [Orbit mission templates](https://github.com/kubestellar/console-kb/tree/main/runbooks)
- [Community Slack](https://kubestellar.io/slack)

**Want to contribute?** We are actively looking for community-contributed Orbit mission templates. If you have a recurring cluster check you run manually today, turn it into an Orbit mission and share it with the ecosystem.
