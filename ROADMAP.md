# KubeStellar Console Roadmap

This document outlines the planned direction for KubeStellar Console. It is a living document and will be updated as priorities evolve based on community feedback, user needs, and ecosystem changes.

## Completed Milestones

### v0.1 — Foundation (Q3 2025)
- Multi-cluster dashboard with real-time health monitoring
- Helm release tracking across clusters
- Pod, deployment, and event monitoring cards
- Demo mode with MSW mock data for offline usage
- GitHub OAuth authentication
- Dark/light theme support

### v0.2 — Intelligence Layer (Q4 2025)
- AI-powered missions system with Claude and kagent integration
- Community missions browser with console-kb knowledge base
- Contributor rewards system with leaderboard and coin economy
- 80+ dashboard cards covering CNCF ecosystem
- GPU monitoring cards (overview, inventory, utilization, reservations)
- OPA, Kyverno, Falco, and Trivy security cards
- ArgoCD application monitoring
- Drag-and-drop dashboard customization with card catalog

### v0.3 — Scale & Operations (Q1–Q2 2026)
- **Console Studio** — Visual dashboard builder with AI card generation
- **Mission Control** — Guided CNCF project deployment with Flight Plan blueprint, phased launch, and AI-assisted cluster assignment
- **Orbital Maintenance** — Automated cluster maintenance missions with scheduling
- **Benchmark streaming** — Real-time vLLM/llm-d performance data via Google Drive with hardware leaderboards
- **GPU namespace drill-down** — Per-GPU-type, per-node allocation views
- **Workload import dialog** — YAML, Helm, GitHub, and Kustomize import support
- **NPS survey system** — In-app Net Promoter Score feedback collection
- **VCluster and KubeVirt** cards for virtualized workloads
- **Marketplace** — Community card preset marketplace with 45+ CNCF project templates
- **OpenSSF Scorecard improvements** — Signed releases, SLSA provenance, scoped workflow permissions
- 160+ total dashboard cards
- Nightly and weekly automated releases with Helm OCI chart publishing
- Comprehensive Auto-QA workflows for code quality, governance, and UI consistency
- Contributor leaderboard with GitHub-synced rewards

## Near-Term (Q2–Q3 2026)

- **llm-d stack monitoring** — First-class support for llm-d inference serving: EPP routing, model endpoint health, autoscaler status, disaggregated serving topology
- **Nightly E2E expansion** — Automated end-to-end testing across all 8 llm-d deployment guides on OpenShift
- **Marketplace v2** — Require live data hooks, unified controls, demo data, and install links for all card presets; community review process
- **kagent/kagenti integration** — Full agent lifecycle management through MCP-compatible interfaces
- **i18n completeness** — Eliminate all hardcoded English strings; prepare for localization
- **Accessibility audit** — Replace remaining `window.confirm()` dialogs, add ARIA labels, keyboard navigation for all interactive elements

## Mid-Term (Q3–Q4 2026)

- **Multi-tenant RBAC** — Role-based access control for teams sharing a Console instance, with namespace-scoped permissions
- **Plugin architecture** — Extensible card and mission system allowing third-party developers to build custom dashboard components
- **Helm operator** — Kubernetes operator for fleet-wide Console deployment and lifecycle management
- **Enhanced AI missions** — AI-assisted troubleshooting missions that diagnose cluster issues and suggest remediation steps
- **Offline/air-gapped mode** — Full Console functionality without internet connectivity for restricted environments
- **CNCF incubation preparation** — Governance documentation, adopters program, security audit, and community growth metrics

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
- **Compete with commercial APM tools** — Console provides operational visibility, not deep application performance monitoring. Use Datadog, New Relic, or Grafana for APM.

## How to Influence the Roadmap

We welcome community input on priorities:

- **GitHub Issues** — Open an issue on [kubestellar/console](https://github.com/kubestellar/console/issues) with the `enhancement` label
- **Discussions** — Join [#kubestellar-dev on Slack](https://cloud-native.slack.com/channels/kubestellar-dev)
- **Mailing List** — Email [kubestellar-dev@googlegroups.com](mailto:kubestellar-dev@googlegroups.com)
