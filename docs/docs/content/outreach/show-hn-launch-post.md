# Show HN: KubeStellar Console — AI-Native Multi-Cluster Kubernetes Dashboard

*Draft for Hacker News "Show HN" post + r/kubernetes cross-post*

---

## TL;DR

**Try it now** (zero install): [https://console.kubestellar.io](https://console.kubestellar.io)

**Or run locally** (one command):
```bash
curl -H "Cache-Control: no-cache" -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

**GitHub**: [kubestellar/console](https://github.com/kubestellar/console)

---

## What Is This?

KubeStellar Console is an AI-powered multi-cluster Kubernetes dashboard where AI doesn't just answer questions — it actively observes your clusters, surfaces issues before you notice them, and suggests specific actions through guided missions.

Unlike most Kubernetes dashboards that show you data and wait for you to figure out what to do, this one watches patterns across all your clusters and says: "Namespace X is using 80% of its CPU quota, want me to help adjust limits?" or "Three pods in cluster Y are in CrashLoopBackOff because of the same config issue — here's a mission to fix all of them."

It's also the only multi-cluster dashboard with a zero-install **demo mode**. The hosted version at console.kubestellar.io runs entirely on mock data (via MSW — Mock Service Worker), so you can see the full UI, interact with cards, trigger AI missions, and explore the interface without connecting to any cluster. No sign-up, no Docker, no local Kubernetes — just click and browse.

---

## Why We Built This

**Multi-cluster is the reality for most teams.** You have dev clusters, staging, prod, edge deployments, GPU workloads in one region, databases in another. Every tool treats multi-cluster as an afterthought — you end up with browser tabs open to 5 different cluster UIs, kubectl context-switching, and zero visibility across all of them at once.

**AI in dashboards usually means chatbots.** You ask "show me failing pods," it shows you failing pods. That's fine, but we wanted something more proactive: an AI that notices problems as they happen, correlates events across clusters, and guides you through fixing them with step-by-step missions.

**Demo mode makes open source projects accessible.** Most Kubernetes dashboards require a cluster just to see the UI. That's a huge barrier for casual evaluation. With demo mode, anyone can click the link, see the dashboard, and decide if it's worth installing — without spending 20 minutes setting up a local cluster.

---

## How It Works

1. **Multi-cluster by default** — point it at your kubeconfig (or multiple). All clusters show up in one dashboard.
2. **AI Missions** — the AI watches your clusters and creates missions like "Fix 3 CrashLooping pods in cluster X" or "Optimize CPU requests across all namespaces." Each mission is a step-by-step workflow you can follow or hand off to the AI to execute.
3. **313 dashboard cards** — cluster health, GPU monitoring, ArgoCD/Flux drift detection, RBAC explorer, security scanning (Trivy, Falco, Kyverno), cost analysis, and 300+ more integrations with CNCF projects.
4. **Persistent AI runtime (Stellar)** — missions run as Kubernetes CRDs on your cluster. They persist across browser sessions and can be triggered by events (new deployment, resource threshold hit, security scan failure).
5. **Community marketplace** — add cards and missions from the community or publish your own.

---

## Key Features

### Zero-Install Demo Mode
Visit [console.kubestellar.io](https://console.kubestellar.io) and see the full UI with realistic data — no cluster required. This is powered by MSW (Mock Service Worker) and runs entirely in your browser.

### AI Missions
Example missions:
- "Audit RBAC across all clusters and flag overly-permissive roles"
- "Find all images without security scans and run Trivy on them"
- "Compare resource requests vs actual usage across clusters and suggest right-sizing"

Each mission is trackable, resumable, and auditable. You can see what the AI is doing at every step.

### Multi-Cluster Observability
One dashboard for all your clusters. Live event feeds, resource usage, security posture, GitOps drift, GPU utilization — everything in one place.

### Extensible via Community Marketplace
Don't like our cards? Build your own. Share them in the marketplace. Anyone can install them with one click.

---

## Tech Stack

- **Frontend**: React + TypeScript, Tailwind CSS, 15+ switchable themes
- **Backend**: Go (Fiber v2), SQLite WASM for persistent cache
- **AI**: Claude, OpenAI, Gemini, local LLMs via Ollama — plug in any provider
- **K8s**: client-go, controller-runtime for CRDs
- **Demo mode**: MSW (Mock Service Worker) for zero-install browser experience

Open source (Apache 2.0). Zero telemetry. Runs entirely on your machine or in your cluster.

---

## Try It

**Hosted demo**: [console.kubestellar.io](https://console.kubestellar.io)

**Local install** (one command):
```bash
curl -H "Cache-Control: no-cache" -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

This downloads the console, starts a lightweight local agent (reads your kubeconfig), and opens your browser. Nothing leaves your machine.

**GitHub**: [github.com/kubestellar/console](https://github.com/kubestellar/console)

---

## What's Next

We're working on:
- Drasi integration for reactive data pipelines across clusters
- LLM-d inference monitoring (track token usage, latency, costs for LLM workloads running on your clusters)
- GPU workload observability (A100/H100 utilization, CUDA errors, multi-GPU job scheduling)
- Federated mission execution (one mission that runs across 100+ edge clusters)

---

## Community

- **Slack**: [#kubestellar-dev on CNCF Slack](https://cloud-native.slack.com/archives/C097094RZ3M)
- **Meetings**: Bi-weekly community meetings ([calendar](https://github.com/kubestellar/console/blob/main/docs/docs/content/community/meetings.md))
- **Contributing**: We have a bug bounty program — report issues, earn rewards

---

## FAQ

**Q: Does this work with OpenShift / EKS / GKE / k3s / kind?**
A: Yes. Any cluster in your kubeconfig works.

**Q: Where does my cluster data go?**
A: Nowhere. The local agent runs on your machine and talks directly to your clusters. The console talks to the agent. Nothing is sent to external servers unless you use an external AI provider (Claude, OpenAI) for missions — in which case only the specific mission context is sent, not your full cluster state.

**Q: Can I run this in production?**
A: Yes. Deploy the console as a Kubernetes Deployment in your cluster. Use the Helm chart or the provided YAML manifests.

**Q: What's the difference between this and Lens / k9s / Octant?**
A: Those are great tools. This is focused on multi-cluster observability and AI-driven workflows. If you manage 5+ clusters and want AI to help spot patterns and automate fixes, this is for you. If you manage one cluster and want a fast terminal UI, k9s is great.

**Q: Is this related to KubeStellar (the multi-cluster orchestration project)?**
A: Yes. KubeStellar Console was built as the observability layer for KubeStellar's multi-cluster control plane, but it works standalone with any Kubernetes clusters.

---

## Credits

Built by the KubeStellar community. Special thanks to contributors from IBM Research, Red Hat, Cornell University SDF, and the CNCF ecosystem.

The AI-native development model (agents writing/reviewing most PRs) is documented here: [docs/news/ai-maintained-codebase.md](https://github.com/kubestellar/console/blob/main/docs/docs/content/news/ai-maintained-codebase.md)

---

**Try it**: [console.kubestellar.io](https://console.kubestellar.io) | **GitHub**: [kubestellar/console](https://github.com/kubestellar/console)
