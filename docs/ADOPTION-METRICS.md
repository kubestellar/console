# Adoption Metrics

This document tracks adoption metrics for KubeStellar Console to provide quantitative evidence of project traction and community growth, supporting CNCF incubation due diligence.

## Overview

CNCF incubation requires demonstrable evidence of adoption, production usage, and community health. This document defines the metrics framework, collection methodology, and current data for KubeStellar Console. Metrics are organized into six categories: web analytics, installation, active usage, community engagement, marketplace activity, and ecosystem integration.

> **Note:** Placeholder values are marked with `_TBD_`. Replace with actual data when available. Snapshot date should be recorded with each update.

**Last updated:** _TBD_

---

## 1. Web Analytics (GA4)

The hosted console at [console.kubestellar.io](https://console.kubestellar.io) uses Google Analytics 4 for anonymous, privacy-respecting usage telemetry.

| Metric | Period | Value |
|--------|--------|-------|
| Page views | Last 30 days | _TBD_ |
| Unique visitors | Last 30 days | _TBD_ |
| Average session duration | Last 30 days | _TBD_ |
| Returning visitors (%) | Last 30 days | _TBD_ |
| Top pages by views | Last 30 days | _TBD_ |

### Geographic Distribution

| Region | Visitors (%) |
|--------|-------------|
| North America | _TBD_ |
| Europe | _TBD_ |
| Asia-Pacific | _TBD_ |
| Other | _TBD_ |

### Traffic Sources

| Source | Sessions (%) |
|--------|-------------|
| Direct | _TBD_ |
| Organic search | _TBD_ |
| Referral (GitHub, CNCF) | _TBD_ |
| Social | _TBD_ |

---

## 2. Installation Metrics

### Helm Chart Downloads

KubeStellar Console is distributed via OCI-compatible Helm chart registry.

| Metric | Period | Value |
|--------|--------|-------|
| Total Helm chart pulls | All time | _TBD_ |
| Helm chart pulls | Last 30 days | _TBD_ |
| Unique pulling IPs | Last 30 days | _TBD_ |

### Container Image Pulls

| Image | Registry | Total Pulls | Last 30 Days |
|-------|----------|-------------|--------------|
| `kubestellar/console` | Docker Hub | _TBD_ | _TBD_ |
| `ghcr.io/kubestellar/console` | GitHub Container Registry | _TBD_ | _TBD_ |

### Installation Methods

| Method | Estimated Usage (%) |
|--------|-------------------|
| Helm chart | _TBD_ |
| Docker / Podman | _TBD_ |
| Local development (`start-dev.sh`) | _TBD_ |
| Hosted (console.kubestellar.io) | _TBD_ |

---

## 3. Active Usage

These metrics reflect live usage of the console across self-hosted and hosted deployments.

### Cluster Connections

| Metric | Period | Value |
|--------|--------|-------|
| Total clusters connected | Last 30 days | _TBD_ |
| Unique kubeconfig contexts discovered | Last 30 days | _TBD_ |
| Average clusters per user | Last 30 days | _TBD_ |
| Multi-cluster users (≥ 2 clusters) | Last 30 days | _TBD_ |

### Dashboard Engagement

| Metric | Period | Value |
|--------|--------|-------|
| Dashboard loads | Last 30 days | _TBD_ |
| Card interactions (expand, drill-down) | Last 30 days | _TBD_ |
| Average cards per dashboard | Last 30 days | _TBD_ |
| AI chat sessions initiated | Last 30 days | _TBD_ |

### Mission Completions

| Metric | Period | Value |
|--------|--------|-------|
| Total missions started | Last 30 days | _TBD_ |
| Total missions completed | Last 30 days | _TBD_ |
| Completion rate (%) | Last 30 days | _TBD_ |
| Most popular missions (top 5) | Last 30 days | _TBD_ |

---

## 4. Community Engagement

### GitHub Metrics

| Metric | Value |
|--------|-------|
| Stars | _TBD_ |
| Forks | _TBD_ |
| Watchers | _TBD_ |
| Total contributors | _TBD_ |
| New contributors (last 90 days) | _TBD_ |

### Issue Velocity

| Metric | Period | Value |
|--------|--------|-------|
| Issues opened | Last 30 days | _TBD_ |
| Issues closed | Last 30 days | _TBD_ |
| Median time to first response | Last 30 days | _TBD_ |
| Median time to close | Last 30 days | _TBD_ |

### Pull Request Activity

| Metric | Period | Value |
|--------|--------|-------|
| PRs opened | Last 30 days | _TBD_ |
| PRs merged | Last 30 days | _TBD_ |
| Median time to merge | Last 30 days | _TBD_ |
| External contributor PRs (%) | Last 30 days | _TBD_ |

### Community Channels

| Channel | Members/Subscribers |
|---------|-------------------|
| CNCF Slack `#kubestellar-dev` | _TBD_ |
| Mailing list subscribers | _TBD_ |
| Community meeting attendees (avg) | _TBD_ |

---

## 5. Marketplace Activity

The KubeStellar Marketplace provides guided install missions for CNCF and open-source projects.

### Preset & Mission Catalog

| Metric | Value |
|--------|-------|
| Total marketplace presets | _TBD_ |
| Total install missions | _TBD_ |
| CNCF project integrations | _TBD_ |
| Non-CNCF project integrations | _TBD_ |

### Adoption by Upstream Projects

Projects that have endorsed or integrated KubeStellar Console missions:

| Project | CNCF Maturity | Upstream Issue/PR | Status |
|---------|--------------|-------------------|--------|
| Open Cluster Management | Sandbox | — | Active |
| Notary Project / Ratify | Incubating | — | Active |
| OpenCost | Sandbox | [opencost/opencost#3649](https://github.com/opencost/opencost/issues/3649) | Endorsed |
| KitOps | Sandbox | [kitops-ml/kitops#1115](https://github.com/kitops-ml/kitops/issues/1115) | Endorsed |
| Submariner | Sandbox | [submariner-io/submariner#3907](https://github.com/submariner-io/submariner/issues/3907) | Endorsed |
| Microcks | Sandbox | [microcks/community#125](https://github.com/microcks/community/pull/125) | Contributed |
| kcp | Sandbox | [kcp-dev/kcp#3923](https://github.com/kcp-dev/kcp/issues/3923) | Engaged |

> See [ADOPTERS.MD](../ADOPTERS.MD) for the full adopter list.

### Community Contributions

| Metric | Value |
|--------|-------|
| Community-contributed presets | _TBD_ |
| Community-contributed missions | _TBD_ |
| External preset downloads | _TBD_ |

---

## 6. Ecosystem Integration

### Supported Kubernetes Distributions

| Distribution | Tested | Status |
|-------------|--------|--------|
| Vanilla Kubernetes | Yes | _TBD_ |
| OpenShift | _TBD_ | _TBD_ |
| EKS | _TBD_ | _TBD_ |
| GKE | _TBD_ | _TBD_ |
| AKS | _TBD_ | _TBD_ |
| k3s / k3d | _TBD_ | _TBD_ |
| Kind | Yes | _TBD_ |

### AI/LLM Provider Integrations

| Provider | Status |
|----------|--------|
| Claude (Anthropic) | Supported |
| OpenAI | Supported |
| Gemini (Google) | Supported |

---

## Methodology

### Data Collection

| Category | Source | Collection Method |
|----------|--------|------------------|
| Web analytics | GA4 | Automatic (console.kubestellar.io) |
| Installation | Registry APIs | Docker Hub API, GHCR API, Helm OCI registry |
| Active usage | Application telemetry | Aggregate, anonymous counters (opt-in) |
| Community | GitHub API | Public repository metrics |
| Marketplace | Internal catalog | Preset/mission registry counts |

### Privacy Considerations

- **No PII is collected.** All usage telemetry is anonymous and aggregate.
- Web analytics use GA4 with IP anonymization enabled.
- Self-hosted deployments do not phone home — usage metrics from self-hosted instances are not collected unless the operator explicitly opts in.
- Community metrics are derived from public GitHub data only.
- All data collection complies with the [KubeStellar Privacy Policy](https://kubestellar.io/privacy) and CNCF guidelines.

### Update Cadence

This document should be updated:
- **Monthly** for web analytics and installation metrics
- **Quarterly** for community engagement and marketplace activity
- **Before each CNCF review milestone** with a comprehensive snapshot

### Automation

Where possible, metrics should be collected via automated scripts:
- GitHub metrics: GitHub REST/GraphQL API
- Container pulls: Docker Hub API (`/v2/repositories/{namespace}/{name}/`)
- GA4: Google Analytics Data API (v1)

---

## References

- [CNCF Incubation Criteria](https://github.com/cncf/toc/blob/main/process/graduation_criteria.md)
- [CNCF Due Diligence Guidelines](https://github.com/cncf/toc/blob/main/process/due-diligence-guidelines.md)
- [KubeStellar Console Adopters](../ADOPTERS.MD)
- [KubeStellar Community](COMMUNITY.md)
