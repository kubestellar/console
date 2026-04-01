# KubeStellar Console Roadmap

This document outlines the planned direction for KubeStellar Console. It is a living document and will be updated as priorities evolve based on community feedback, user needs, and ecosystem changes.

## Near-Term (Q2 2026)

- **Benchmark streaming dashboard** — Real-time performance data from vLLM/llm-d benchmarks via Google Drive integration, with hardware leaderboards and latency breakdowns
- **GPU namespace drill-down** — Per-GPU-type, per-node allocation views with usage duration metrics for GPU-intensive workloads
- **llm-d integration** — First-class support for llm-d inference serving: deployment status, autoscaler monitoring, model endpoint health
- **Nightly E2E expansion** — Automated end-to-end testing across all 8 llm-d deployment guides on OpenShift
- **Marketplace growth** — Expand guided install missions beyond 250 CNCF projects with community-contributed missions

## Mid-Term (Q3–Q4 2026)

- **Multi-tenant RBAC** — Role-based access control for teams sharing a Console instance, with namespace-scoped permissions
- **Plugin architecture** — Extensible card and mission system allowing third-party developers to build custom dashboard components
- **Helm operator** — Kubernetes operator for fleet-wide Console deployment and lifecycle management
- **Enhanced AI missions** — AI-assisted troubleshooting missions that diagnose cluster issues and suggest remediation steps
- **Offline/air-gapped mode** — Full Console functionality without internet connectivity for restricted environments

## Long-Term (2027+)

- **GitOps integration** — Native integration with Flux and Argo CD for declarative cluster management through the Console
- **Policy engine** — Built-in policy authoring, testing, and enforcement with OPA/Gatekeeper integration
- **AI-assisted operations** — Proactive anomaly detection, capacity planning, and automated incident response via MCP
- **Federation** — Console-to-Console federation for organizations managing multiple Console instances across regions
- **Compliance dashboards** — Automated compliance reporting against CIS benchmarks, SOC 2, and HIPAA requirements

## Non-Goals

KubeStellar Console intentionally does **not** aim to:

- **Replace kubectl** — Console is a visual companion, not a CLI replacement. Power users should continue using kubectl, helm, and other CLI tools directly.
- **Be a general-purpose IDE** — While Console includes AI-powered features, it is not a code editor or development environment.
- **Manage non-Kubernetes workloads** — Console focuses exclusively on Kubernetes clusters and cloud-native workloads.
- **Provide its own container runtime** — Console observes and manages existing clusters; it does not provision infrastructure.

## How to Influence the Roadmap

We welcome community input on priorities:

- **GitHub Issues** — Open an issue on [kubestellar/console](https://github.com/kubestellar/console/issues) with the `enhancement` label
- **Discussions** — Join [#kubestellar-dev on Slack](https://cloud-native.slack.com/channels/kubestellar-dev)
- **Mailing List** — Email [kubestellar-dev@googlegroups.com](mailto:kubestellar-dev@googlegroups.com)
