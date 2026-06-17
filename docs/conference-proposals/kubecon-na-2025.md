# KubeCon NA 2025 — Session Proposal Drafts

> *Draft for review and submission — see issue #18649*
> *KubeCon + CloudNativeCon NA 2025, Atlanta, GA, November 2025*
> *CFP typically closes: late June / early July*

---

## Option A: 30-Minute Talk (Primary Submission)

### Title
**"From Zero to 250: Building an AI-Powered Multi-Cluster Kubernetes Dashboard"**

### Abstract (under 600 words)

Managing Kubernetes at scale means managing complexity at scale. Platform teams running three or more clusters — across cloud providers, on-prem, and edge — face a fragmented tooling landscape: Argo CD for GitOps, KEDA for autoscaling, Kyverno for policy, Prometheus for metrics, and 20 more tools, each with its own dashboard, each requiring its own login, each showing you only its slice of the picture.

KubeStellar Console tackles this problem with a card-based dashboard that aggregates data from 250+ CNCF projects across every cluster in your kubeconfig — and adds an AI agent that can observe, explain, and act on what it finds.

In this talk, we'll walk through:

1. **The architecture**: How a cache-first card system (SQLite WASM in a Web Worker + stale-while-revalidate) delivers instant multi-cluster visibility without burning your cluster API servers
2. **The AI mission system**: How YAML-defined missions let an LLM-backed agent guide a user from zero to a running Cilium installation in five minutes — including error recovery, live verification, and rollback
3. **The Stellar runtime** (alpha): How we're moving from request/response AI toward a persistent operational agent that monitors cluster state continuously, correlates events, and executes remediation workflows asynchronously
4. **The demo**: A live walkthrough — zero install, zero config, zero clusters needed — at console.kubestellar.io

**What attendees will take away:**
- A reusable pattern for building cache-first multi-cluster observability UIs
- A mental model for AI agents that operate on Kubernetes state (not just chat about it)
- How to contribute a card for their own CNCF project to the console marketplace

### Session Format
30 minutes + 5 min Q&A

### Track
Multi-Cluster Management / AI + Kubernetes (cross-track submission recommended)

### Speaker Bio Template

> *[Speaker Name]* is a [role] at [org] and a contributor to the KubeStellar project. They have spoken at [prior venues] and work on [relevant area]. They can be reached at [contact].

---

## Option B: Lightning Talk (5 Minutes)

### Title
**"KubeStellar Console: Your Clusters, One View, 60-Second Install"**

### Abstract (under 200 words)

You run multiple clusters. You're tired of context-switching between dashboards. KubeStellar Console gives you a single browser tab that aggregates data from Argo CD, KEDA, Kyverno, Cilium, Prometheus, and 245 other CNCF tools across all your clusters simultaneously — with an AI agent that can explain what it sees and help you fix what's broken.

In five minutes, we'll show you:
- A live multi-cluster dashboard with real data (no prep, no cluster required)
- The 60-second install: `curl -sSL .../start.sh | bash`
- How to add a card for your CNCF project in 30 minutes

Zero install for the demo. Zero config for the evaluation. Just a URL.

### Session Format
Lightning talk, 5 minutes

---

## Option C: Co-Presentation with Karmada (30 Minutes)

### Title
**"Multi-Cluster Operations at Scale: Karmada Federation + KubeStellar Console Visibility"**

### Abstract (under 600 words)

Two CNCF projects. One problem. Karmada handles workload scheduling and policy federation across Kubernetes clusters; KubeStellar Console surfaces the resulting state in a unified, AI-augmented dashboard. Together they form a complete multi-cluster operations platform.

In this co-presentation, the Karmada and KubeStellar teams will demonstrate an end-to-end multi-cluster workflow:
1. Define a workload propagation policy in Karmada
2. Watch it roll out across three clusters in the KubeStellar Console dashboard
3. Trigger an anomaly; let the console AI diagnose and suggest a fix
4. Execute a remediation mission that calls back into Karmada APIs

We'll also discuss the architectural choices — why Karmada uses a pull model for federation, why the console uses a push model for data delivery, and how the two complement each other without overlap.

### Session Format
30 minutes + 5 min Q&A (requires a confirmed Karmada co-presenter)

---

## Submission Checklist

- [ ] Confirm KubeCon NA 2025 CFP open date and deadline
- [ ] Select primary abstract (Option A recommended)
- [ ] Identify and confirm speaker(s)
- [ ] Prepare demo environment (console.kubestellar.io is sufficient for Options A and B)
- [ ] For Option C: contact Karmada maintainers via `#karmada` CNCF Slack
- [ ] Submit at `sessionize.com/kubecon-cloudnativecon-na-2025` (URL TBC — verify official CFP URL)
- [ ] Share submission confirmation in issue #18649

---

*Filed by outreach agent (ACMM L6 — full mode)*
