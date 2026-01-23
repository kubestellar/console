# KubeStellar Console - Complete Inventory

Last Updated: 2026-01-22

## Summary

| Category | Count |
|----------|-------|
| Dashboard Pages | 20 (1 main + 19 dedicated) |
| Card Types | 60 |
| Stats Block Types | 85 (across 13 dashboard types) |

---

## 1. Dashboard Pages (20 Total)

### Main Dashboard
| # | Name | Route | Component |
|---|------|-------|-----------|
| 1 | Main Dashboard | `/` | `Dashboard.tsx` |

### Dedicated Dashboards (19)
| # | Name | Route | Component |
|---|------|-------|-----------|
| 2 | Clusters | `/clusters` | `Clusters.tsx` |
| 3 | Workloads | `/workloads` | `Workloads.tsx` |
| 4 | Pods | `/pods` | `Pods.tsx` |
| 5 | Nodes | `/nodes` | `Nodes.tsx` |
| 6 | Deployments | `/deployments` | `Deployments.tsx` |
| 7 | Services | `/services` | `Services.tsx` |
| 8 | Operators | `/operators` | `Operators.tsx` |
| 9 | Helm Releases | `/helm` | `HelmReleases.tsx` |
| 10 | Logs | `/logs` | `Logs.tsx` |
| 11 | Compute | `/compute` | `Compute.tsx` |
| 12 | Storage | `/storage` | `Storage.tsx` |
| 13 | Network | `/network` | `Network.tsx` |
| 14 | Events | `/events` | `Events.tsx` |
| 15 | Security | `/security` | `Security.tsx` |
| 16 | GitOps | `/gitops` | `GitOps.tsx` |
| 17 | Alerts | `/alerts` | `Alerts.tsx` |
| 18 | Cost | `/cost` | `Cost.tsx` |
| 19 | Compliance | `/compliance` | `Compliance.tsx` |
| 20 | GPU Reservations | `/gpu-reservations` | `GPUReservations.tsx` |

### Utility Pages (Not counted as dashboards)
| Name | Route | Component |
|------|-------|-----------|
| Card History | `/history` | `CardHistory.tsx` |
| Settings | `/settings` | `Settings.tsx` |
| User Management | `/users` | `UserManagement.tsx` |
| Namespace Manager | `/namespaces` | `NamespaceManager.tsx` |

---

## 2. Card Types (60 Total)

### Category: Cluster Health (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 1 | `cluster_health` | Cluster Health | status |
| 2 | `cluster_metrics` | Cluster Metrics | timeseries |
| 3 | `cluster_focus` | Cluster Focus | status |
| 4 | `cluster_comparison` | Cluster Comparison | bar |
| 5 | `cluster_costs` | Cluster Costs | bar |
| 6 | `upgrade_status` | Cluster Upgrade Status | status |
| 7 | `cluster_resource_tree` | Cluster Resource Tree | table |

### Category: Workloads (6 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 8 | `deployment_status` | Deployment Status | donut |
| 9 | `deployment_issues` | Deployment Issues | table |
| 10 | `deployment_progress` | Deployment Progress | gauge |
| 11 | `pod_issues` | Pod Issues | table |
| 12 | `top_pods` | Top Pods | bar |
| 13 | `app_status` | Workload Status | donut |

### Category: Compute (8 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 14 | `compute_overview` | Compute Overview | status |
| 15 | `resource_usage` | Resource Usage | gauge |
| 16 | `resource_capacity` | Resource Capacity | bar |
| 17 | `gpu_overview` | GPU Overview | gauge |
| 18 | `gpu_status` | GPU Status | donut |
| 19 | `gpu_inventory` | GPU Inventory | table |
| 20 | `gpu_workloads` | GPU Workloads | table |
| 21 | `gpu_usage_trend` | GPU Usage Trend | timeseries |

### Category: Storage (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 22 | `storage_overview` | Storage Overview | status |
| 23 | `pvc_status` | PVC Status | table |

### Category: Network (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 24 | `network_overview` | Network Overview | status |
| 25 | `service_status` | Service Status | table |
| 26 | `cluster_network` | Cluster Network | status |

### Category: GitOps (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 27 | `helm_release_status` | Helm Releases | status |
| 28 | `helm_history` | Helm History | events |
| 29 | `helm_values_diff` | Helm Values Diff | table |
| 30 | `chart_versions` | Helm Chart Versions | table |
| 31 | `kustomization_status` | Kustomization Status | status |
| 32 | `overlay_comparison` | Overlay Comparison | table |
| 33 | `gitops_drift` | GitOps Drift | status |

### Category: ArgoCD (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 34 | `argocd_applications` | ArgoCD Applications | status |
| 35 | `argocd_sync_status` | ArgoCD Sync Status | donut |
| 36 | `argocd_health` | ArgoCD Health | status |

### Category: Operators (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 37 | `operator_status` | OLM Operators | status |
| 38 | `operator_subscriptions` | Operator Subscriptions | table |
| 39 | `crd_health` | CRD Health | status |

### Category: Namespaces (4 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 40 | `namespace_overview` | Namespace Overview | status |
| 41 | `namespace_quotas` | Namespace Quotas | gauge |
| 42 | `namespace_rbac` | Namespace RBAC | table |
| 43 | `namespace_events` | Namespace Events | events |

### Category: Security & Events (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 44 | `security_issues` | Security Issues | table |
| 45 | `event_stream` | Event Stream | events |
| 46 | `user_management` | User Management | table |

### Category: Live Trends (4 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 47 | `events_timeline` | Events Timeline | timeseries |
| 48 | `pod_health_trend` | Pod Health Trend | timeseries |
| 49 | `resource_trend` | Resource Trend | timeseries |
| 50 | `gpu_utilization` | GPU Utilization | timeseries |

### Category: Klaude AI (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 51 | `klaude_issues` | Klaude Issues | status |
| 52 | `klaude_kubeconfig_audit` | Klaude Kubeconfig Audit | status |
| 53 | `klaude_health_check` | Klaude Health Check | gauge |

### Category: Alerting (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 54 | `active_alerts` | Active Alerts | status |
| 55 | `alert_rules` | Alert Rules | table |

### Category: Cost Management (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 56 | `cluster_costs` | Cluster Costs | bar |
| 57 | `opencost_overview` | OpenCost | bar |
| 58 | `kubecost_overview` | Kubecost | bar |

### Category: Policy Management (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 59 | `opa_policies` | OPA Gatekeeper | status |
| 60 | `kyverno_policies` | Kyverno Policies | status |

---

## 3. Stats Blocks (85 Total across 13 Dashboard Types)

### Clusters Dashboard Stats (10 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 1 | `clusters` | Clusters | Server | purple |
| 2 | `healthy` | Healthy | CheckCircle2 | green |
| 3 | `unhealthy` | Unhealthy | XCircle | orange |
| 4 | `unreachable` | Offline | WifiOff | yellow |
| 5 | `nodes` | Nodes | Box | cyan |
| 6 | `cpus` | CPUs | Cpu | blue |
| 7 | `memory` | Memory | MemoryStick | green |
| 8 | `storage` | Storage | HardDrive | purple |
| 9 | `gpus` | GPUs | Zap | yellow |
| 10 | `pods` | Pods | Layers | purple |

### Workloads Dashboard Stats (7 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 11 | `namespaces` | Namespaces | FolderOpen | purple |
| 12 | `critical` | Critical | AlertCircle | red |
| 13 | `warning` | Warning | AlertTriangle | yellow |
| 14 | `healthy` | Healthy | CheckCircle2 | green |
| 15 | `deployments` | Deployments | Layers | blue |
| 16 | `pod_issues` | Pod Issues | AlertOctagon | orange |
| 17 | `deployment_issues` | Deploy Issues | XCircle | red |

### Pods Dashboard Stats (6 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 18 | `total_pods` | Total Pods | Box | purple |
| 19 | `healthy` | Healthy | CheckCircle2 | green |
| 20 | `issues` | Issues | AlertCircle | red |
| 21 | `pending` | Pending | Clock | yellow |
| 22 | `restarts` | High Restarts | RotateCcw | orange |
| 23 | `clusters` | Clusters | Server | cyan |

### GitOps Dashboard Stats (8 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 24 | `total` | Total | Package | purple |
| 25 | `helm` | Helm | Ship | blue |
| 26 | `kustomize` | Kustomize | Layers | cyan |
| 27 | `operators` | Operators | Settings | purple |
| 28 | `deployed` | Deployed | CheckCircle2 | green |
| 29 | `failed` | Failed | XCircle | red |
| 30 | `pending` | Pending | Clock | blue |
| 31 | `other` | Other | MoreHorizontal | gray |

### Storage Dashboard Stats (5 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 32 | `ephemeral` | Ephemeral | HardDrive | purple |
| 33 | `pvcs` | PVCs | Database | blue |
| 34 | `bound` | Bound | CheckCircle2 | green |
| 35 | `pending` | Pending | Clock | yellow |
| 36 | `storage_classes` | Storage Classes | Layers | cyan |

### Network Dashboard Stats (6 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 37 | `services` | Services | Workflow | blue |
| 38 | `loadbalancers` | LoadBalancers | Globe | green |
| 39 | `nodeport` | NodePort | Network | yellow |
| 40 | `clusterip` | ClusterIP | Box | cyan |
| 41 | `ingresses` | Ingresses | ArrowRightLeft | purple |
| 42 | `endpoints` | Endpoints | CircleDot | gray |

### Security Dashboard Stats (7 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 43 | `issues` | Issues | ShieldAlert | red |
| 44 | `critical` | Critical | AlertCircle | red |
| 45 | `high` | High | AlertTriangle | orange |
| 46 | `medium` | Medium | AlertTriangle | yellow |
| 47 | `low` | Low | Info | blue |
| 48 | `privileged` | Privileged | ShieldOff | red |
| 49 | `root` | Running as Root | User | orange |

### Compliance Dashboard Stats (6 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 50 | `score` | Score | Percent | purple |
| 51 | `total_checks` | Total Checks | ClipboardList | blue |
| 52 | `passing` | Passing | CheckCircle2 | green |
| 53 | `failing` | Failing | XCircle | red |
| 54 | `warning` | Warning | AlertTriangle | yellow |
| 55 | `critical_findings` | Critical | AlertCircle | red |

### Compute Dashboard Stats (8 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 56 | `nodes` | Nodes | Server | purple |
| 57 | `cpus` | CPUs | Cpu | blue |
| 58 | `memory` | Memory | MemoryStick | green |
| 59 | `gpus` | GPUs | Zap | yellow |
| 60 | `tpus` | TPUs | Sparkles | orange |
| 61 | `pods` | Pods | Layers | cyan |
| 62 | `cpu_util` | CPU Util | Activity | blue |
| 63 | `memory_util` | Memory Util | Activity | green |

### Events Dashboard Stats (5 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 64 | `total` | Total | List | purple |
| 65 | `warnings` | Warnings | AlertTriangle | yellow |
| 66 | `normal` | Normal | Info | blue |
| 67 | `recent` | Recent (1h) | Clock | cyan |
| 68 | `errors` | Errors | XCircle | red |

### Cost Dashboard Stats (6 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 69 | `total_cost` | Total Cost | DollarSign | green |
| 70 | `cpu_cost` | CPU Cost | Cpu | blue |
| 71 | `memory_cost` | Memory Cost | MemoryStick | purple |
| 72 | `storage_cost` | Storage Cost | HardDrive | cyan |
| 73 | `network_cost` | Network Cost | Globe | yellow |
| 74 | `gpu_cost` | GPU Cost | Zap | orange |

### Alerts Dashboard Stats (5 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 75 | `firing` | Firing | AlertCircle | red |
| 76 | `pending` | Pending | Clock | yellow |
| 77 | `resolved` | Resolved | CheckCircle2 | green |
| 78 | `rules_enabled` | Rules Enabled | Shield | blue |
| 79 | `rules_disabled` | Rules Disabled | ShieldOff | gray |

### Main Dashboard Stats (6 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 80 | `clusters` | Clusters | Server | blue |
| 81 | `healthy` | Healthy | CheckCircle2 | green |
| 82 | `warnings` | Warnings | AlertTriangle | yellow |
| 83 | `errors` | Errors | XCircle | red |
| 84 | `namespaces` | Namespaces | FolderTree | purple |
| 85 | `pods` | Pods | Box | cyan |

---

## 4. Component Files Reference

### Dashboard Components
- Main: `web/src/components/dashboard/Dashboard.tsx`
- Card wrapper: `web/src/components/cards/CardWrapper.tsx`
- Card chat: `web/src/components/cards/CardChat.tsx`

### Card Management
- Add Card Modal: `web/src/components/dashboard/AddCardModal.tsx`
- Configure Card Modal: `web/src/components/dashboard/ConfigureCardModal.tsx`
- Replace Card Modal: `web/src/components/dashboard/ReplaceCardModal.tsx`
- Card Recommendations: `web/src/components/dashboard/CardRecommendations.tsx`
- Reset Dialog: `web/src/components/dashboard/ResetDialog.tsx`

### Stats Configuration
- Stats Config: `web/src/components/ui/StatsConfig.tsx`
- Stats Overview: `web/src/components/ui/StatsOverview.tsx`

### Hooks
- Dashboard Cards: `web/src/hooks/useDashboardCards.ts`
- Dashboard Context: `web/src/hooks/useDashboardContext.tsx`
- Card Recommendations: `web/src/hooks/useCardRecommendations.ts`
- Multi-dashboard: `web/src/hooks/useDashboards.ts`

---

## 5. Card Visualization Types

| Type | Icon | Description |
|------|------|-------------|
| `gauge` | ⏱️ | Circular progress indicator |
| `table` | 📋 | Data table with rows/columns |
| `timeseries` | 📈 | Line chart over time |
| `events` | 📜 | Event/log feed |
| `donut` | 🍩 | Donut/pie chart |
| `bar` | 📊 | Bar chart |
| `status` | 🚦 | Status grid/list |
| `sparkline` | 〰️ | Mini trend line |

---

## 6. Future Cards (Planned)

Based on feature requests:
- Cluster Location Card (regions/zones)
- GitHub Monitoring Card (PR trends, issues, stars)
- Kubectl Command Card (custom kubectl commands)
- Prow-specific Card
- LLM-d specific Card
- WVA/EPP/Istio/HPA Cards
- Workload Monitor Card (comprehensive workload tracking)

---

## 7. Modal Dialogs (13 Total)

### Dashboard-Related Modals (6)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 1 | AddCardModal | `dashboard/AddCardModal.tsx` | "Add Card" button | AI-powered modal for adding dashboard cards with "Browse Cards" and "AI Suggestions" tabs |
| 2 | ConfigureCardModal | `dashboard/ConfigureCardModal.tsx` | Card settings icon | Card configuration with toggles, cluster/namespace selectors, and AI suggestions |
| 3 | ReplaceCardModal | `dashboard/ReplaceCardModal.tsx` | Card replace action | Replace card with "Select" and "AI" tabs for choosing new card type |
| 4 | ResetDialog | `dashboard/ResetDialog.tsx` | Dashboard reset action | Two-option dialog: "Add Missing Cards" or "Replace All Cards" |
| 5 | TemplatesModal | `dashboard/TemplatesModal.tsx` | Templates selector | Dashboard template browser organized by category |
| 6 | ResourceDetailModal | `dashboard/ResourceDetailModal.tsx` | Click resource in card | Generic resource detail modal with Details, Actions, and AI tabs |

### Cluster Management Modals (3)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 7 | ClusterDetailModal | `clusters/ClusterDetailModal.tsx` | Click cluster in list | Comprehensive cluster details: health, metrics, nodes, workloads, GPU inventory |
| 8 | RenameModal | `clusters/components/RenameModal.tsx` | Pencil icon on cluster | Rename kubeconfig context display name |
| 9 | GPUDetailModal | `clusters/components/GPUDetailModal.tsx` | GPU card in cluster detail | GPU resource details: inventory, specs, utilization, per-cluster breakdown |

### Navigation/Exploration Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 10 | DrillDownModal | `drilldown/DrillDownModal.tsx` | Click resources in cards | Hierarchical navigation for Kubernetes resources with breadcrumbs |

### Feature/Feedback Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 11 | FeatureRequestModal | `feedback/FeatureRequestModal.tsx` | Feedback button | Submit feedback/bugs and track request updates with GitHub integration |

### Setup/Onboarding Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 12 | AgentSetupDialog | `agent/AgentSetupDialog.tsx` | Auto on app load (if agent not connected) | Install KubeStellar Console agent with quick install command |

### GitOps Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 13 | SyncDialog | `gitops/SyncDialog.tsx` | GitOps sync action | Multi-phase sync workflow: Detection → Plan → Execute → Complete |

### Modal Features
- All modals support ESC key to close
- Use React portals for proper z-index layering
- Feature blur backdrop overlays
- Most support keyboard navigation
