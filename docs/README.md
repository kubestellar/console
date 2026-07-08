# Documentation Index

This index covers the Markdown and YAML documentation files in `docs/` and groups them by their primary audience.

## Key entry points

- [Repository README](../README.md) — product overview, install paths, and environment setup
- [Developer guide](../CLAUDE.md) — canonical repo guide for coding agents and contributors
- [Contribution guide](../CONTRIBUTING.md) — contribution workflow, review expectations, and repo conventions
- [Architecture overview](ARCHITECTURE.md) — console architecture summary
- [Deployment guide](deploy.md) — `deploy.sh` reference and deployment flags
- [Troubleshooting](troubleshooting.md) — operational troubleshooting reference
- [Release process](RELEASING.md) — release workflow and packaging notes
- [Console marketplace](https://github.com/kubestellar/console-marketplace) — community dashboards, card presets, and themes

## For developers

| File | Description |
| --- | --- |
| [AI-QUALITY-ASSURANCE.md](AI-QUALITY-ASSURANCE.md) | Explains the layered QA model used for AI-assisted development and CI feedback loops. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Summarizes the console architecture, major subsystems, and design direction. |
| [INVENTORY.md](INVENTORY.md) | Tracks the docs-area inventory of cards, dashboards, modals, and related UI surfaces. |
| [TEST-COVERAGE-ARCHITECTURE.md](TEST-COVERAGE-ARCHITECTURE.md) | Documents the project's test coverage strategy and architecture. |
| [ai-mission-proposals.md](ai-mission-proposals.md) | Research and ideation notes for possible future AI mission types. |
| [flux-status-progress.md](flux-status-progress.md) | Implementation progress notes for the Flux status card and related validation. |
| [ai/RETAINEDKNOWLEDGE.md](ai/RETAINEDKNOWLEDGE.md) | Describes the retained knowledge and resolution-memory system. |
| [ai/work.md](ai/work.md) | Captures AI-related work items and planning notes. |
| [components/ActiveAlerts.md](components/ActiveAlerts.md) | Component reference for the Active Alerts dashboard card. |
| [components/ClusterHealth.md](components/ClusterHealth.md) | Component reference for the Cluster Health dashboard card. |
| [components/GITHUB_ACTIVITY_CARD.md](components/GITHUB_ACTIVITY_CARD.md) | Design and implementation notes for the GitHub Activity card. |
| [components/TEMPLATE.md](components/TEMPLATE.md) | Template for writing new component documentation pages. |
| [components/component-criteria.md](components/component-criteria.md) | Defines the criteria and review checklist for dashboard components. |
| [plans/PLUGIN-ARCHITECTURE-RFC.md](plans/PLUGIN-ARCHITECTURE-RFC.md) | RFC defining plugin scope, extension points, security constraints, and phased rollout. |
| [plans/GITOPS-INTEGRATION-RFC.md](plans/GITOPS-INTEGRATION-RFC.md) | Concrete mid-term RFC for Flux + Argo CD integration, declarative Console config, and Mission Control deep links. |
| [plans/PR-TRIAGE-SLA.md](plans/PR-TRIAGE-SLA.md) | Proposed review and Auto-QA triage SLA for `ai-needs-human` PRs and issues. |
| [plans/UNIFIED-DEMO-SKELETON-PLAN.md](plans/UNIFIED-DEMO-SKELETON-PLAN.md) | Implementation plan for the unified demo-data and loading-skeleton system. |
| [plans/planjan21.md](plans/planjan21.md) | Plan for console filtering and data-consistency improvements from January 2026. |
| [qa/AI-UX-ISSUE-AGENT-BRIEF.md](qa/AI-UX-ISSUE-AGENT-BRIEF.md) | Operating brief for the agent that turns Playwright UX findings into issues. |
| [qa/CONSOLE_TESTING_REPORT.md](qa/CONSOLE_TESTING_REPORT.md) | UI testing and consistency audit report for the console. |
| [qa/EFFICIENCY_IMPROVEMENTS.md](qa/EFFICIENCY_IMPROVEMENTS.md) | Summary of React efficiency changes made in response to Auto-QA findings. |
| [qa/consistency.md](qa/consistency.md) | Consistency test results and follow-up notes for the console. |
| [security/HARDCODED_URLS.md](security/HARDCODED_URLS.md) | Reviews hardcoded URLs and API endpoint configuration from a security perspective. |
| [security/SECURITY-AI.md](security/SECURITY-AI.md) | Threat model and audit checklist for AI and LLM automation surfaces. |

## For operators

| File | Description |
| --- | --- |
| [ALERT_NOTIFICATIONS.md](ALERT_NOTIFICATIONS.md) | Configures alert notification channels and delivery behavior. |
| [SUPPORT.md](SUPPORT.md) | Defines support expectations, maintenance policy, and support channels. |
| [deploy.md](deploy.md) | Full `deploy.sh` reference with flags, environment variables, and examples. |
| [integrations/argocd.md](integrations/argocd.md) | Integration guide for running the console with Argo CD workflows. |
| [integrations/kagenti-tool-integration.md](integrations/kagenti-tool-integration.md) | Explains Kagenti tool integration and cluster context injection. |
| [kagenti-deployment-guide.md](kagenti-deployment-guide.md) | Deployment guide for Kagenti controller and agent topologies. |
| [kagenti-tools.md](kagenti-tools.md) | Overview of Kagenti tool integration and supported tooling. |
| [runbooks/bot-roundtrip-failures.md](runbooks/bot-roundtrip-failures.md) | Runbook for diagnosing `kubestellar-console-bot` roundtrip failures. |
| [security/SECURITY-MODEL.md](security/SECURITY-MODEL.md) | Explains the security model, air-gapped deployment posture, and local/self-hosted LLM paths. |
| [stellar/architecture.md](stellar/architecture.md) | Architecture notes for the Stellar persistent AI operations assistant. |
| [stellar/crds-v1alpha1.yaml](stellar/crds-v1alpha1.yaml) | Reference CRD manifest for Stellar v1alpha1 resources. |
| [troubleshooting.md](troubleshooting.md) | Common troubleshooting steps for install, auth, and runtime issues. |

## For contributors

| File | Description |
| --- | --- |
| [README.md](README.md) | This index for the `docs/` tree and its primary entry points. |
| [ACCESSIBILITY-AUDIT.md](ACCESSIBILITY-AUDIT.md) | Accessibility audit findings and recommendations for the console UI. |
| [ADOPTION-METRICS.md](ADOPTION-METRICS.md) | Tracks adoption metrics and evidence used for CNCF incubation due diligence. |
| [COMMUNITY.md](COMMUNITY.md) | Community channels, engagement guidance, and project participation information. |
| [HOMEBREW.md](HOMEBREW.md) | Explains Homebrew support status for the console and kc-agent. |
| [RELEASING.md](RELEASING.md) | Release-process reference for maintainers packaging and publishing releases. |
| [cncf-insights/2026-05-27.md](cncf-insights/2026-05-27.md) | Snapshot report of CNCF landscape intelligence from 2026-05-27. |
| [console-marketplace](https://github.com/kubestellar/console-marketplace) | Community contribution hub for dashboard exports, card presets, and themes. |
| [security/SELF-ASSESSMENT.md](security/SELF-ASSESSMENT.md) | Project security self-assessment and related review notes. |
