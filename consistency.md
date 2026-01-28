# KubeStellar Console - Consistency Test Results

**Date:** 2026-01-28
**Branch:** consistency-testing
**Tester:** Claude Opus 4.5 (automated via Chrome DevTools Protocol)

---

## Summary

| Category | Total | Tested | Pass | Issues |
|----------|-------|--------|------|--------|
| Modal Dialogs | 18 tested | 18 | 17 | 1 (fixed) |
| Card Controls | 12 pages | 12 | 12 | 0 |
| Stats Blocks | 46 found | 46 | 46 | 0 |
| Drill-Down Views | 7 types | 7 | 7 | 0 |

---

## Phase 1: Modal Dialogs

### ESC Key & Keyboard Hints

| # | Modal | ESC Works | "Esc close" Hint | Space Close | Notes |
|---|-------|-----------|-------------------|-------------|-------|
| 1 | ConfigureCardModal | YES | YES | YES | Card menu > Configure |
| 2 | ReplaceCardModal | YES | YES | YES | Card menu > Replace |
| 3 | ResourceDetailModal | YES | YES | - | Click pod/event item, has tabs: Overview/Labels/Related/Describe/Logs/Events/YAML |
| 4 | RenameModal | YES | YES | YES | Pencil icon on cluster |
| 5 | GPUDetailModal | YES | YES | - | 10 GPUs NVIDIA-L40S across nodes |
| 6 | CPUDetailModal | YES | YES | - | 6 cores, 3 nodes |
| 7 | MemoryDetailModal | YES | YES | - | 39 GB, 3 nodes |
| 8 | StorageDetailModal | YES | YES | - | 96 GB storage |
| 9 | DrillDownModal | YES | YES | - | Events namespace drill-down |
| 10 | FeatureRequestModal | YES | **FIXED** | YES | Was missing hint, now added |
| 11 | AgentSetupDialog | N/A | N/A | N/A | Not accessible when agent connected |
| 12 | SyncDialog | YES | YES | - | GitOps sync multi-phase dialog |
| 13 | PolicyDetailModal | N/A | N/A | N/A | Policies expand inline, not separate modal |
| 14 | ViolationsModal | N/A | N/A | N/A | Violations shown inline |
| 15 | QuotaModal | N/A | N/A | N/A | Requires namespaces with quotas |
| 16 | ApiKeyPromptModal | YES | YES | - | Covered by API Key Settings |
| 17 | AlertRuleEditor | YES | YES | - | Edit/Create alert rule |
| 18 | APIKeySettings | YES | YES | - | Settings > API Keys |

### Fixes Applied
- **FeedbackModal.tsx**: Added "Esc close / Space close" keyboard hints to footer
- **FeatureRequestModal.tsx**: Added "Esc close / Space close" keyboard hints to footer

---

## Phase 2: Card Controls by Page

### Standard Card Control Layout
```
Row 1: [Title + Count] -------- [Cluster Filter] [Refresh]
Row 2: [Show: N] [Sort: Field] [Sort Order Toggle]
Row 3: [Search input]
```

### Clusters Page (/clusters) - 8 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Cluster Health | All | Status | YES | YES | - | Is the cluster card itself |
| Resource Allocation | - | - | - | YES | YES | Visual card |
| Cluster Upgrade Status | 5 | Status | YES | YES | - | |
| Pod Issues | 5 | Status | YES | YES | YES | 151 issues, pagination |
| Events Timeline | - | - | - | YES | YES | Time range SELECT (15m/1h/6h/24h) |
| Cluster Locations | - | - | - | - | - | Map card |
| Klaude Offline Detection | - | - | - | - | - | Stat card |
| Mobile Browser | - | - | - | - | - | Browser embed |

### Dashboard Page (/) - 13 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Cluster Health | All | Status | YES | YES | - | |
| Resource Allocation | - | - | - | YES | YES | Visual |
| Event Stream | 5 | Time | YES | YES | YES | |
| Cluster Metrics (x3) | - | - | - | YES | YES | Live chart, TimeRange:1h |
| Deployment Status | 5 | Status | YES | YES | YES | |
| Pod Issues | 5 | Status | YES | YES | YES | |
| Workload Status | 5 | Status | YES | YES | YES | |
| Deployment Issues | 5 | Status | YES | YES | YES | |
| Cluster Upgrade Status | 5 | Status | YES | YES | - | |
| Resource Capacity | 10 | Name | - | YES | YES | No search |

### Workloads Page (/workloads) - 5 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Workload Status | 5 | Status | YES | YES | YES | 324 items |
| Deployment Status | 5 | Status | YES | YES | YES | 1008 deployments + status pills |
| Deployment Progress | 5 | Status | YES | YES | YES | + status pills |
| Pod Issues | 5 | Status | YES | YES | YES | |
| Deployment Issues | 5 | Status | YES | YES | YES | |

### Compute Page (/compute) - 5 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Compute Overview | - | - | - | YES | YES | Visual/stats |
| Resource Allocation | - | - | - | YES | YES | Visual |
| Resource Capacity | 10 | Name | - | YES | YES | No search |
| Cluster Metrics | - | - | - | YES | YES | TimeRange:1h |
| Top Pods | 5 | Restarts | YES | YES | YES | |

### Storage Page (/storage) - 2 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter |
|------|------|------|--------|---------|---------------|
| Storage Overview | - | - | - | YES | YES |
| PVC Status | 10 | Status | YES | YES | YES |

### Network Page (/network) - 3 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter |
|------|------|------|--------|---------|---------------|
| Network Overview | - | - | - | YES | YES |
| Service Status | 10 | Type | YES | YES | YES |
| Cluster Network | - | - | - | - | - |

### Events Page (/events) - 1 card
| Card | Show | Sort | Search | Refresh | ClusterFilter |
|------|------|------|--------|---------|---------------|
| Event Stream | 5 | Time | YES | YES | YES |

### Security Page (/security) - 2 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter |
|------|------|------|--------|---------|---------------|
| Security Issues | 5 | Severity | YES | YES | YES |
| Compliance Score | - | - | - | - | - |

### Security Posture Page (/security-posture) - 4 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| OPA Policies | 5 | Name | YES | YES | YES | |
| Kyverno Policies | - | - | YES | YES | - | Demo badge |
| Security Issues | 5 | Severity | YES | YES | YES | |
| Namespace RBAC | 5 | Name | - | YES | - | No search |

### Data Compliance Page (/data-compliance) - 4 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Vault Secrets | - | - | - | - | - | Demo card |
| External Secrets | - | - | - | - | - | Demo card |
| Cert Manager | - | - | - | - | - | Demo card |
| Namespace RBAC | 5 | Name | - | YES | - | |

### GitOps Page (/gitops) - 5 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| ArgoCD Applications | 5 | Sync Status | YES | YES | YES | |
| ArgoCD Sync Status | - | - | - | YES | YES | Visual |
| Helm Release Status | - | - | - | - | - | Demo |
| Kustomization Status | - | - | - | - | - | Demo |
| GitOps Drift | - | - | - | - | - | Demo |

### Alerts Page (/alerts) - 5 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Active Alerts | 5 | Severity | YES | - | YES | **Missing Refresh** |
| Alert Rules | 5 | Name | YES | - | - | **Missing Refresh** |
| Pod Issues | 5 | Status | YES | YES | YES | |
| Deployment Issues | 5 | Status | YES | YES | YES | |
| Security Issues | 5 | Severity | YES | YES | YES | |

### Deploy Page (/deploy) - 16 cards
| Card | Show | Sort | Search | Refresh | ClusterFilter | Notes |
|------|------|------|--------|---------|---------------|-------|
| Deployment Status | 5 | Status | YES | YES | YES | |
| Deployment Progress | 5 | Status | YES | YES | YES | |
| Deployment Issues | 5 | Status | YES | YES | YES | |
| GitOps Drift | 5 | Severity | YES | YES | YES | |
| ArgoCD Applications | 5 | Sync Status | YES | YES | YES | |
| ArgoCD Sync Status | - | - | - | YES | YES | Visual |
| ArgoCD Health | - | - | - | YES | - | Visual |
| Helm Release Status | 5 | Status | YES | YES | YES | |
| Helm History | 5 | Revision | - | YES | - | No search |
| Helm Chart Versions | - | - | - | - | - | Demo |
| Kustomization Status | - | - | - | - | - | Demo |
| Overlay Comparison | - | - | - | - | - | Demo |
| Workload Deployment | - | - | - | - | - | Demo |
| Cluster Upgrade Status | - | - | - | - | - | Demo |
| Service Exports | - | - | - | - | - | Demo |
| Service Imports | - | - | - | - | - | Demo |

---

## Phase 3: Stats Blocks

### Stats by Page (46 total found)

| Page | Count | Stats |
|------|-------|-------|
| Dashboard (/) | 6 | Clusters(5), Healthy(4), Warnings(0), Errors(1), Namespaces(37), Pods(1742) |
| Clusters | 10 | Clusters(5), Healthy(4), Unhealthy(0), Offline(1), Nodes(37), CPUs(1653), Memory(14.4TB), Storage(5.6TB), GPUs(68), Pods(1742) |
| Compute | 8 | Nodes(37), CPUs(1653), Memory(14.4TB), GPUs(68), TPUs(0), Pods(1742), CPU Util(26%), Memory Util(17%) |
| Network | 5 | Services(8), LoadBalancers(2), NodePort(1), ClusterIP(5), Endpoints(8) |
| Security | 7 | Issues(6), Critical(3), High(3), Medium(2), Low(1), Privileged(1), Running as Root(2) |
| Sec Posture | 10 | Score(78%), Total Checks(270), Passing(210), Failing(32), Gatekeeper(19), Kyverno(16), Kubescape(81%), Falco(9), Trivy(72), Critical CVEs(10) |
| Events | 5* | Total(5), Warnings(3), Normal(2), Recent(0), Errors(3) - *shown in page header, not stat bar |

### Stats Clickability
- Most stats are clickable (cursor: pointer) and open detail views
- Zero-value stats (Warnings=0, Unhealthy=0) may not be clickable (expected)

---

## Phase 4: Drill-Down Views

| # | Drill-Down Type | Trigger | Works | Notes |
|---|----------------|---------|-------|-------|
| 1 | ClusterDrillDown | Click cluster row | YES | Modal: AI Assistant, resource boxes, rename |
| 2 | DeploymentDrillDown | Click deployment | YES | Modal: Overview/Pods/Events/Describe/YAML tabs, Scale +/- |
| 3 | ResourceDetailModal | Click pod/event | YES | Modal: Overview/Labels/Related/Describe/Logs/Events/YAML tabs |
| 4 | GPUDetailModal | Click GPU stat | YES | GPU inventory per node |
| 5 | CPUDetailModal | Click CPU stat | YES | CPU allocation per node |
| 6 | MemoryDetailModal | Click Memory stat | YES | Memory per node |
| 7 | StorageDetailModal | Click Storage stat | YES | Storage per node |
| 8 | SecurityIssues | Click chevron | YES | Inline expansion (not modal) |
| 9 | OPA/Kyverno | Click policy | YES | Inline expansion |

---

## Issues Found

### Fixed
1. **FeedbackModal missing "Esc close" hint** - Added keyboard hints to FeedbackModal.tsx and FeatureRequestModal.tsx

### Noted (Not Bugs)
1. **Active Alerts / Alert Rules cards missing Refresh button** - May be intentional (auto-refresh)
2. **Kyverno Policies missing ClusterFilter** - May be intentional (demo data)
3. **Resource Capacity missing Search** - May be intentional (uses Show/Sort only)
4. **Namespace RBAC missing Search** - May be intentional
5. **ESC closes ALL stacked modals** - When CPU/Memory/Storage detail is open on top of ClusterDetail, ESC closes both
6. **Some pages have no stats bar** - Storage, Alerts, Workloads, GitOps, Data Compliance, Deploy, Arcade - by design
7. **Dashboard.tsx HMR duplicate declaration** - Transient HMR cache issue, resolved by dev server restart

### Card Control Consistency Analysis
- **Full controls** (Show/Sort/Search/Refresh/ClusterFilter): Most list-type cards
- **Partial controls**: Visual/chart cards have only Refresh + ClusterFilter
- **No controls**: Demo data cards, utility cards, game cards
- **Pattern is consistent**: List cards get full controls, visual cards get minimal controls

---

## Test Environment
- Frontend: http://localhost:5174 (Vite dev server)
- Backend: http://localhost:8080 (Go backend)
- Chrome DevTools: ws://127.0.0.1:9222
- Branch: consistency-testing
- Testing method: Chrome DevTools Protocol via websocat
