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
- **Mission Control** — Guided CNCF project deployment with Flight Plan blueprint, phased launch, and AI-assisted cluster assignment; dry-run mode and kind cluster E2E tests
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
- **AI Missions UX** — Message edit/resend, microphone input, scroll-to-bottom, draft click-to-open, history toggle panel, mission sort by activity, retry on failure, response cancellation
- **Auth hardening** — GA4 telemetry on auth failure paths (SSE 401, WS token missing, agent token failure, session refresh), agentFetch migration for all kc-agent calls, HS256-only JWT parsing (TAG-Security fix)
- **kc-agent API expansion** — `/nvidia-operators`, `/events/stream` SSE, `/federation/detect`, agent token bridging to frontend
- **Responsive container-query rollout** — Phase 3a/3b across 63 files: responsive skeleton grids, flex-wrap in CNCF status cards
- **Test infrastructure** — Coverage from 0% to 91%: 10,000+ unit tests, 12-shard parallel coverage, coverage regression guard with auto-issue, post-merge Playwright verification against production
- **Code quality automation** — UI/UX standards scanner with Storybook and Playwright visual regression, post-build vendor safety checks, MSW catch-all for unmocked routes
- **Backend refactoring** — Monolith splits: sqlite.go (3,321 → 8 files), server_http.go/server_ai.go/server_operations.go into domain handlers, CardWrapper.tsx into 4 sub-components; 609 fmt.Sprintf calls converted to structured slog fields
- **ArgoCD ApplicationSet** integration with security fixes
- **Saved Filter Sets** — Snapshot all filters into named presets; merged Project Selector and Filter Panel into single dropdown
- **Learn dropdown** — Auto-populated from YouTube playlist with video tutorials
- **Claude Code GitHub Action** — AI-assisted PR review and issue triage via Claude Opus 4.6

## v0.4 — AI-Native Observability (Target: Q3 2026)

This milestone crystallizes the near-term roadmap items into a cohesive theme: establishing KubeStellar Console as the canonical AI/ML workload visibility and operations layer for Kubernetes.

### Core Scope

- **llm-d stack monitoring** — First-class support for llm-d inference serving: EPP routing, model endpoint health, autoscaler status, disaggregated serving topology
- **Drasi reactive pipelines** — Real-time change-feed dashboard for Drasi continuous queries, sources, and reactions across deployment modes (drasi-server, drasi-platform, CRD-based)
- **kagent/kagenti integration** — Full agent lifecycle management through MCP-compatible interfaces

### Quality & Testing

- **Nightly E2E expansion** — Automated end-to-end testing across all 8 llm-d deployment guides on OpenShift
- **Marketplace v2** — Require live data hooks, unified controls, demo data, and install links for all card presets; community review process

### UX & Accessibility

- **i18n completeness** — Eliminate all hardcoded English strings; prepare for community localization contributions
- **Accessibility audit** — Replace remaining `window.confirm()` dialogs, add ARIA labels, keyboard navigation for all interactive elements
- **GA4 UX funnel** — Measure conversion from landing to agent install to first mission; identify and fix drop-off points
- **Component consistency** — Migrate remaining raw HTML elements to shared UI components (Button, Modal, Dialog); standardize modal visibility patterns

### Community Health

- **Adopters program** — Populate ADOPTERS.MD with confirmed production users; define maturity tiers (install-mission vs. production deployment)
- **Contributor onboarding** — Establish PR triage SLA, define `ai-needs-human` escalation path, and publish contributor guide update; see `docs/plans/PR-TRIAGE-SLA.md`
- **Adoption metrics** — Replace all `TBD` fields in `docs/adoption-metrics.md` with real measurements before any CNCF application

### Tech Debt Unblocking Strategy

As the codebase scales past 160+ dashboard cards and 10,000+ unit tests, technical debt items that were previously deprioritized ("hold" status) now represent scaling risks. This section defines the unblocking strategy to address accumulated tech debt before it impacts delivery velocity.

**Priority 1: Performance & Scalability**
- **Card render optimization** — Audit and fix cards with >500ms initial render time; establish performance budgets per card type
- **Cache eviction policy** — Implement LRU eviction for SQLite WASM cache to prevent unbounded growth; target <50MB cache size
- **Test parallelization** — Reduce CI test suite runtime from current baseline; investigate Jest worker memory limits

**Priority 2: Code Health**
- **TypeScript strict mode** — Enable `strict: true` incrementally, starting with new files; eliminate remaining `any` types in card components
- **Dependency updates** — Unblock Vite 6, React 19, and Tailwind 4 upgrades currently held due to breaking changes; allocate dedicated sprint
- **Bundle size** — Audit and tree-shake unused dependencies; target <2MB initial JS bundle (currently ~2.8MB)

**Priority 3: Developer Experience**
- **Storybook coverage** — Achieve 80% component coverage in Storybook (currently ~40%); prioritize cards with complex state
- **E2E test stability** — Fix flaky Playwright tests in `nightly-e2e` workflow; define retry/timeout standards
- **Documentation debt** — Update outdated API docs in `pkg/api/`, particularly for Stellar subsystem endpoints

**Execution Model**
- Allocate 20% of each sprint cycle to tech debt work (approximately 1 issue per developer per 2-week sprint)
- Tag tech debt issues with `tech-debt` label and priority tier (`p1-perf`, `p2-health`, `p3-dx`)
- Track tech debt ratio (tech debt issues / total issues) as a key health metric; target <15%
- Block new feature work if tech debt ratio exceeds 25% or any P1 item is open >30 days

## Near-Term (Q2–Q3 2026)

See **v0.4 — AI-Native Observability** milestone above for the full near-term feature scope, quality gates, and community health targets.

**Branch Stability Covenant (effective immediately):** Main branch must remain green at all times. A post-merge integration smoke gate (combining TS build, auth smoke, and workflow startup checks) is required before new feature PRs are merged. See issue [#17756](https://github.com/kubestellar/console/issues/17756) for tracking.

## Mid-Term (Q3–Q4 2026)

- **Stellar subsystem GA** — Graduate the Stellar persistent AI runtime from alpha to GA: finalize CRD versioning (v1 stability), complete Mission Operator test coverage, publish upgrade path documentation, and achieve at least one confirmed non-demo deployment. GA criteria tracked in [#17757](https://github.com/kubestellar/console/issues/17757). Stellar GA is the strategic milestone that moves Console from a dashboard to a production AI operations runtime.
- **GitOps integration milestone** — First-class Flux + Argo CD support with observability parity, declarative Console configuration, and Mission Control deep links; see `docs/plans/GITOPS-INTEGRATION-RFC.md`
- **Multi-tenant RBAC** — Role-based access control for teams sharing a Console instance, with namespace-scoped permissions
- **Plugin architecture** — Extensible card and mission system allowing third-party developers to build custom dashboard components; see `docs/plans/PLUGIN-ARCHITECTURE-RFC.md` (RFC to be authored — tracked in [#17760](https://github.com/kubestellar/console/issues/17760))
- **Helm operator** — Kubernetes operator for fleet-wide Console deployment and lifecycle management
- **Enhanced AI missions** — AI-assisted troubleshooting missions that diagnose cluster issues and suggest remediation steps
- **Offline/air-gapped mode** — Full Console functionality without internet connectivity for restricted environments
- **CNCF incubation preparation** — Governance documentation, adopters program, and community growth metrics; target Q4 2026 TOC application
- **Third-party security audit (Q3 2026)** — Engage CNCF-sponsored auditors (ADA Logics or CNCF Security Audit program) for formal code security audit; required gate for CNCF incubation. **Owner:** clubanderson. **Timeline:** Open CNCF Security Audit request at https://github.com/cncf/toc/issues in Q2 2026; schedule audit completion for Q3 2026. This positions the project for Q4 2026 incubation application with completed security due-diligence.
- **Multi-model AI backend** — Support for multiple LLM providers (OpenAI, Ollama, vLLM) behind a unified mission interface, reducing vendor lock-in
- **Webhook-driven card updates** — Push-based card refresh via Kubernetes webhooks instead of polling, reducing API server load on large clusters
- **Custom alert rules** — User-defined threshold alerts on any card metric, with notification channels (Slack, email, PagerDuty)

## Long-Term (2027+)

- **Policy engine** — Built-in policy authoring, testing, and enforcement with OPA/Gatekeeper integration
- **AI-assisted operations** — Proactive anomaly detection, capacity planning, and automated incident response via MCP
- **Federation** — Console-to-Console federation for organizations managing multiple Console instances across regions
- **Compliance dashboards** — Automated compliance reporting against CIS benchmarks, SOC 2, and HIPAA requirements
- **Collaborative dashboards** — Real-time multi-user dashboard editing with presence indicators and conflict resolution
- **Workflow automation** — Visual workflow builder for multi-step cluster operations (rolling upgrades, canary deployments, disaster recovery runbooks)
- **Embedded terminal** — In-browser kubectl/helm terminal with context-aware autocomplete, scoped to the user's RBAC permissions

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

---

## Strategic Health — June 2026

> Status snapshot filed by the strategist agent (ACMM L6). Updated when material risks to roadmap delivery are identified.
> **Last updated:** 2026-06-12

### Current Risk Register

| Risk | Severity | Issue | Status |
|------|----------|-------|--------|
| Merge gate disabled on `main` — no required status checks | 🔴 Critical | #17852 | Open |
| Main branch build cascade — 8+ breaks on 2026-06-12, recovery SLA undefined | 🔴 Critical | #17756, #17969 | Escalating |
| Auth smoke test regression | 🔴 Critical | #17824 | Open |
| DCO sign-off failures on automation PRs — legal compliance risk | 🔴 Critical | #17966 | Open |
| Coverage suite — 415 failures risk v0.3 "91% coverage" claim | 🟠 High | #17856 | Open |
| v0.4 feature velocity at zero — all recent merges are maintenance | 🟠 High | #17968 | Ongoing |
| Scanner PR backlog stalling v0.4 arch refactor | 🟠 High | #17853 | Open |
| Stellar subsystem — no GA milestone or alpha exit criteria | 🟡 Medium | #17757 | Open |
| Plugin architecture RFC exists (Draft) but issue tracker not closed | 🟡 Medium | #17760 | RFC exists |
| Organic contributor drought — <4% human PR ratio | 🟡 Medium | #17967 | Ongoing |
| Adoption metrics (`docs/ADOPTION-METRICS.md`) all TBD | 🟡 Medium | #17965 | Unresolved |
| CNCF incubation tracker on `hold` | 🟡 Medium | #4072 | Blocked |

### v0.4 Delivery Prerequisites

Before v0.4 ("AI-Native Observability") can ship on-schedule (Q3 2026), the following blockers must be resolved:

1. **Merge gate enforcement** (#17852) — Must be enabled first; every other quality improvement depends on a stable merge pipeline.
2. **Build stabilization** (#17756) — Main must stay green for at least 2 weeks before any v0.4 feature work is reliable.
3. **Recovery SLA definition** (#17969) — Define build sheriff role, 4-hour SLA, and circuit breaker for automation agents when main is broken.
4. **Coverage regression triage** (#17856) — Determine whether the 415-failure coverage suite is a build environment artifact or real test regression.
5. **v0.4 feature work kickoff** (#17968) — Designate a feature captain and open at least one implementation PR for llm-d, Drasi, or kagent integration.

### Adoption Readiness

| Signal | Target | Current |
|--------|--------|---------|
| Main branch build stability | Green ≥14 consecutive days | ❌ Failing (8+ breaks on 2026-06-12) |
| Coverage suite pass rate | >99% | ❌ 415 failures |
| Human contributor ratio | ≥10% of merged PRs | ❌ <4% (1/30 recent merges) |
| ADOPTERS.md confirmed entries | ≥3 production users | ⚠️ TBD |
| Adoption metrics populated | All fields in `docs/ADOPTION-METRICS.md` | ❌ All TBD (#17965) |
| DCO compliance on automation PRs | 100% of merged PRs signed | ⚠️ Gaps identified (#17966) |
| CNCF incubation application | Filed | ⏸ On hold (#4072) |

