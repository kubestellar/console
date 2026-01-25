# KubeStellar Console - Complete Inventory

Last Updated: 2026-01-23

## Summary

| Category | Count |
|----------|-------|
| Dashboard Pages | 20 (1 main + 19 dedicated) |
| Card Types | 109 |
| Cards with Drill-Down | 40 |
| Drill-Down Views | 22 |
| Modal Dialogs | 19 |
| Stats Block Types | 93 (across 14 dashboard types) |

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

## 2. Card Types (109 Total)

### Category: Cluster Health (8 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 1 | `cluster_health` | Cluster Health | status |
| 2 | `cluster_metrics` | Cluster Metrics | timeseries |
| 3 | `cluster_focus` | Cluster Focus | status |
| 4 | `cluster_comparison` | Cluster Comparison | bar |
| 5 | `cluster_costs` | Cluster Costs | bar |
| 6 | `upgrade_status` | Cluster Upgrade Status | status |
| 7 | `cluster_resource_tree` | Cluster Resource Tree | table |
| 8 | `cluster_locations` | Cluster Locations | map |

### Category: Workloads (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 9 | `deployment_status` | Deployment Status | donut |
| 10 | `deployment_issues` | Deployment Issues | table |
| 11 | `deployment_progress` | Deployment Progress | gauge |
| 12 | `pod_issues` | Pod Issues | table |
| 13 | `top_pods` | Top Pods | bar |
| 14 | `app_status` | Workload Status | donut |
| 15 | `workload_deployment` | Workload Deployment | table |

### Category: Compute (8 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 16 | `compute_overview` | Compute Overview | status |
| 17 | `resource_usage` | Resource Usage | gauge |
| 18 | `resource_capacity` | Resource Capacity | bar |
| 19 | `gpu_overview` | GPU Overview | gauge |
| 20 | `gpu_status` | GPU Status | donut |
| 21 | `gpu_inventory` | GPU Inventory | table |
| 22 | `gpu_workloads` | GPU Workloads | table |
| 23 | `gpu_usage_trend` | GPU Usage Trend | timeseries |

### Category: Storage (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 24 | `storage_overview` | Storage Overview | status |
| 25 | `pvc_status` | PVC Status | table |

### Category: Network (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 26 | `network_overview` | Network Overview | status |
| 27 | `service_status` | Service Status | table |
| 28 | `cluster_network` | Cluster Network | status |
| 29 | `service_exports` | Service Exports (MCS) | table |
| 30 | `service_imports` | Service Imports (MCS) | table |
| 31 | `gateway_status` | Gateway API Status | status |
| 32 | `service_topology` | Service Topology | diagram |

### Category: GitOps (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 33 | `helm_release_status` | Helm Releases | status |
| 34 | `helm_history` | Helm History | events |
| 35 | `helm_values_diff` | Helm Values Diff | table |
| 36 | `chart_versions` | Helm Chart Versions | table |
| 37 | `kustomization_status` | Kustomization Status | status |
| 38 | `overlay_comparison` | Overlay Comparison | table |
| 39 | `gitops_drift` | GitOps Drift | status |

### Category: ArgoCD (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 40 | `argocd_applications` | ArgoCD Applications | status |
| 41 | `argocd_sync_status` | ArgoCD Sync Status | donut |
| 42 | `argocd_health` | ArgoCD Health | status |

### Category: Operators (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 43 | `operator_status` | OLM Operators | status |
| 44 | `operator_subscriptions` | Operator Subscriptions | table |
| 45 | `crd_health` | CRD Health | status |

### Category: Namespaces (5 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 46 | `namespace_overview` | Namespace Overview | status |
| 47 | `namespace_quotas` | Namespace Quotas | gauge |
| 48 | `namespace_rbac` | Namespace RBAC | table |
| 49 | `namespace_events` | Namespace Events | events |
| 50 | `namespace_monitor` | Namespace Monitor | status |

### Category: Security & Events (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 51 | `security_issues` | Security Issues | table |
| 52 | `event_stream` | Event Stream | events |
| 53 | `user_management` | User Management | table |

### Category: Live Trends (4 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 54 | `events_timeline` | Events Timeline | timeseries |
| 55 | `pod_health_trend` | Pod Health Trend | timeseries |
| 56 | `resource_trend` | Resource Trend | timeseries |
| 57 | `gpu_utilization` | GPU Utilization | timeseries |

### Category: Klaude AI (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 58 | `klaude_issues` | Klaude Issues | status |
| 59 | `klaude_kubeconfig_audit` | Klaude Kubeconfig Audit | status |
| 60 | `klaude_health_check` | Klaude Health Check | gauge |

### Category: Alerting (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 61 | `active_alerts` | Active Alerts | status |
| 62 | `alert_rules` | Alert Rules | table |

### Category: Cost Management (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 63 | `opencost_overview` | OpenCost | bar |
| 64 | `kubecost_overview` | Kubecost | bar |

### Category: Policy Management (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 65 | `opa_policies` | OPA Gatekeeper | status |
| 66 | `kyverno_policies` | Kyverno Policies | status |

### Category: Compliance & Security Posture (5 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 67 | `falco_alerts` | Falco Alerts | status |
| 68 | `trivy_scan` | Trivy Scan | status |
| 69 | `kubescape_scan` | Kubescape Scan | status |
| 70 | `policy_violations` | Policy Violations | table |
| 71 | `compliance_score` | Compliance Score | gauge |

### Category: Data Compliance (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 72 | `vault_secrets` | Vault Secrets | status |
| 73 | `external_secrets` | External Secrets | status |
| 74 | `cert_manager` | Cert Manager | status |

### Category: Workload Detection (7 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 75 | `prow_jobs` | Prow Jobs | table |
| 76 | `prow_status` | Prow Status | status |
| 77 | `prow_history` | Prow History | events |
| 78 | `llm_inference` | LLM Inference | table |
| 79 | `llm_models` | LLM Models | table |
| 80 | `ml_jobs` | ML Training Jobs | table |
| 81 | `ml_notebooks` | Jupyter Notebooks | table |

### Category: External Integrations (2 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 82 | `github_activity` | GitHub Activity | table |
| 83 | `weather` | Weather | status |

### Category: Utilities (5 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 84 | `kubectl` | Kubectl Terminal | interactive |
| 85 | `iframe_embed` | Iframe Embed | interactive |
| 86 | `network_utils` | Network Utils | interactive |
| 87 | `mobile_browser` | Mobile Browser | interactive |
| 88 | `stock_market_ticker` | Stock Market Ticker | status |

### Category: Games (21 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 89 | `sudoku_game` | Sudoku Game | interactive |
| 90 | `match_game` | Kube Match | interactive |
| 91 | `solitaire` | Kube Solitaire | interactive |
| 92 | `checkers` | AI Checkers | interactive |
| 93 | `game_2048` | Kube 2048 | interactive |
| 94 | `kubedle` | Kubedle | interactive |
| 95 | `pod_sweeper` | Pod Sweeper | interactive |
| 96 | `container_tetris` | Container Tetris | interactive |
| 97 | `flappy_pod` | Flappy Pod | interactive |
| 98 | `kube_man` | Kube-Man | interactive |
| 99 | `kube_kong` | Kube Kong | interactive |
| 100 | `pod_pitfall` | Pod Pitfall | interactive |
| 101 | `node_invaders` | Node Invaders | interactive |
| 102 | `pod_brothers` | Pod Brothers | interactive |
| 103 | `kube_kart` | Kube Kart | interactive |
| 104 | `kube_pong` | Kube Pong | interactive |
| 105 | `kube_snake` | Kube Snake | interactive |
| 106 | `kube_galaga` | Kube Galaga | interactive |
| 107 | `kube_craft` | KubeCraft | interactive |
| 108 | `kube_chess` | Kube Chess | interactive |
| 109 | `kube_craft_3d` | KubeCraft 3D | interactive |

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

### Operators Dashboard Stats (8 blocks)
| # | ID | Name | Icon | Color |
|---|---|------|------|-------|
| 86 | `operators` | Total | Package | purple |
| 87 | `installed` | Installed | CheckCircle2 | green |
| 88 | `installing` | Installing | RefreshCw | blue |
| 89 | `failing` | Failing | XCircle | red |
| 90 | `upgrades` | Upgrades | ArrowUpCircle | orange |
| 91 | `subscriptions` | Subscriptions | Newspaper | indigo |
| 92 | `crds` | CRDs | FileCode | cyan |
| 93 | `clusters` | Clusters | Server | blue |

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

## 7. Modal Dialogs (19 Total)

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

### Stats Configuration Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 14 | StatsConfigModal | `ui/StatsConfig.tsx` | Stats settings icon | Configure visible stats, drag-drop reordering |

### Policy Modals (2)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 15 | PolicyDetailModal | `cards/OPAPolicies.tsx` | Click policy in OPA card | OPA policy details with violations list |
| 16 | ViolationsModal | `cards/OPAPolicies.tsx` | Click cluster with violations | OPA Gatekeeper violations list by severity |

### Inline Card Modals (3)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 17 | QuotaModal | `cards/NamespaceQuotas.tsx` | Add/Edit quota button | Create or edit ResourceQuota with CPU/memory/storage limits |
| 18 | ApiKeyPromptModal | `cards/KlaudeMissions.tsx` | AI feature without API key | Prompts user to configure Anthropic API key for AI features |
| 19 | AlertRuleEditor | `alerts/AlertRuleEditor.tsx` | Add/Edit alert rule | Form for creating/editing Prometheus-style alert rules |

### Modal Features
- All modals support ESC key to close
- Use React portals for proper z-index layering
- Feature blur backdrop overlays
- Most support keyboard navigation

---

## 8. Drill-Down Views (22 Total)

Drill-down views are displayed within `DrillDownModal` when clicking items in cards.

| # | View | File | Triggered By |
|---|------|------|--------------|
| 1 | AlertDrillDown | `drilldown/views/AlertDrillDown.tsx` | ActiveAlerts card |
| 2 | ArgoAppDrillDown | `drilldown/views/ArgoAppDrillDown.tsx` | ArgoCDApplications card |
| 3 | ClusterDrillDown | `drilldown/views/ClusterDrillDown.tsx` | Cluster items in various cards |
| 4 | ConfigMapDrillDown | `drilldown/views/ConfigMapDrillDown.tsx` | ConfigMap resources |
| 5 | CRDDrillDown | `drilldown/views/CRDDrillDown.tsx` | CRDHealth card |
| 6 | DeploymentDrillDown | `drilldown/views/DeploymentDrillDown.tsx` | DeploymentStatus, DeploymentIssues |
| 7 | DriftDrillDown | `drilldown/views/DriftDrillDown.tsx` | GitOpsDrift card |
| 8 | EventsDrillDown | `drilldown/views/EventsDrillDown.tsx` | EventStream, NamespaceEvents |
| 9 | GPUNodeDrillDown | `drilldown/views/GPUNodeDrillDown.tsx` | GPUInventory, GPUStatus cards |
| 10 | HelmReleaseDrillDown | `drilldown/views/HelmReleaseDrillDown.tsx` | HelmReleaseStatus, HelmHistory |
| 11 | KustomizationDrillDown | `drilldown/views/KustomizationDrillDown.tsx` | KustomizationStatus, OverlayComparison |
| 12 | LogsDrillDown | `drilldown/views/LogsDrillDown.tsx` | Pod logs access |
| 13 | NamespaceDrillDown | `drilldown/views/NamespaceDrillDown.tsx` | NamespaceOverview card |
| 14 | NodeDrillDown | `drilldown/views/NodeDrillDown.tsx` | Node items in ComputeOverview |
| 15 | OperatorDrillDown | `drilldown/views/OperatorDrillDown.tsx` | OperatorStatus, OperatorSubscriptions |
| 16 | PodDrillDown | `drilldown/views/PodDrillDown.tsx` | TopPods, PodIssues cards |
| 17 | PolicyDrillDown | `drilldown/views/PolicyDrillDown.tsx` | OPAPolicies, KyvernoPolicies |
| 18 | ReplicaSetDrillDown | `drilldown/views/ReplicaSetDrillDown.tsx` | ReplicaSet resources |
| 19 | ResourcesDrillDown | `drilldown/views/ResourcesDrillDown.tsx` | Generic resource drill-down |
| 20 | SecretDrillDown | `drilldown/views/SecretDrillDown.tsx` | Secret resources |
| 21 | ServiceAccountDrillDown | `drilldown/views/ServiceAccountDrillDown.tsx` | RBAC service accounts |
| 22 | YAMLDrillDown | `drilldown/views/YAMLDrillDown.tsx` | YAML view for any resource |

---

## 9. Cards with Drill-Down (40 Total)

Cards that have `useDrillDownActions` hook for clickable items:

| # | Card | Drill Action | Target View |
|---|------|--------------|-------------|
| 1 | AppStatus | drillToDeployment | DeploymentDrillDown |
| 2 | ArgoCDApplications | drillToArgoApp | ArgoAppDrillDown |
| 3 | ClusterComparison | drillToCluster | ClusterDrillDown |
| 4 | ClusterCosts | drillToCost | CostDrillDown |
| 5 | ClusterFocus | drillToCluster | ClusterDrillDown |
| 6 | ClusterResourceTree | drillToNamespace/Pod | NamespaceDrillDown/PodDrillDown |
| 7 | ComputeOverview | drillToNode | NodeDrillDown |
| 8 | DeploymentIssues | drillToDeployment | DeploymentDrillDown |
| 9 | DeploymentProgress | drillToDeployment | DeploymentDrillDown |
| 10 | DeploymentStatus | drillToDeployment | DeploymentDrillDown |
| 11 | EventStream | drillToEvents | EventsDrillDown |
| 12 | GitOpsDrift | drillToDrift | DriftDrillDown |
| 13 | GPUInventory | drillToGPUNode | GPUNodeDrillDown |
| 14 | GPUOverview | drillToGPUNode | GPUNodeDrillDown |
| 15 | GPUStatus | drillToCluster | ClusterDrillDown |
| 16 | GPUWorkloads | drillToPod | PodDrillDown |
| 17 | HelmHistory | drillToHelm | HelmReleaseDrillDown |
| 18 | HelmReleaseStatus | drillToHelm | HelmReleaseDrillDown |
| 19 | HelmValuesDiff | drillToHelm | HelmReleaseDrillDown |
| 20 | KlaudeMissions | drillToMission | MissionDrillDown |
| 21 | KubecostOverview | drillToCost | CostDrillDown |
| 22 | KustomizationStatus | drillToKustomization | KustomizationDrillDown |
| 23 | NamespaceEvents | drillToEvents | EventsDrillDown |
| 24 | NamespaceOverview | drillToNamespace | NamespaceDrillDown |
| 25 | NamespaceRBAC | drillToRBAC | ServiceAccountDrillDown |
| 26 | NetworkOverview | drillToService | ServiceDrillDown |
| 27 | OpenCostOverview | drillToCost | CostDrillDown |
| 28 | OperatorStatus | drillToOperator | OperatorDrillDown |
| 29 | OperatorSubscriptions | drillToOperator | OperatorDrillDown |
| 30 | OverlayComparison | drillToKustomization | KustomizationDrillDown |
| 31 | PodIssues | drillToPod | PodDrillDown |
| 32 | PVCStatus | drillToPVC | PVCDrillDown |
| 33 | ResourceCapacity | drillToNode | NodeDrillDown |
| 34 | ResourceUsage | drillToNode | NodeDrillDown |
| 35 | SecurityIssues | drillToPod | PodDrillDown |
| 36 | ServiceStatus | drillToService | ServiceDrillDown |
| 37 | StorageOverview | drillToPVC | PVCDrillDown |
| 38 | TopPods | drillToPod | PodDrillDown |
| 39 | UpgradeStatus | drillToCluster | ClusterDrillDown |
| 40 | UserManagement | drillToRBAC | ServiceAccountDrillDown |

### Cards WITHOUT Drill-Down (25 Total)

Cards that don't need drill-down (utilities, charts, games, cards with custom modals):

| Category | Cards |
|----------|-------|
| **Summary/Chart Cards** | ArgoCDHealth, ArgoCDSyncStatus, ClusterHealth, ClusterMetrics, ClusterNetwork, EventsTimeline, GPUUsageTrend, GPUUtilization, NamespaceQuotas, PodHealthTrend, ResourceTrend |
| **Custom Modal Cards** | ActiveAlerts, AlertRules, OPAPolicies, KyvernoPolicies (have their own modals) |
| **Utility/Game Cards** | CardChat, CardWrapper, GitHubActivity, Kubectl, MatchGame, StockMarketTicker, SudokuGame, Weather |
| **Info Display Cards** | ChartVersions, CRDHealth |

---

## 10. Modal Sections (Reusable Components)

Located in `src/components/modals/sections/`:

| Component | File | Description |
|-----------|------|-------------|
| AIActionBar | `AIActionBar.tsx` | Diagnose 🩺, Repair 🔧, Ask ✨ action buttons |
| BreadcrumbNav | `BreadcrumbNav.tsx` | Clickable navigation path for drill-down |
| ResourceBadges | `ResourceBadges.tsx` | Cluster + resource kind badges |

### Modal Hooks

Located in `src/components/modals/hooks/`:

| Hook | Description |
|------|-------------|
| useModalNavigation | ESC to close, Backspace to go back |
| useModalAI | Klaude AI integration for modals |

---

## 11. DrillDown Hook Actions

Available drill actions from `useDrillDownActions()`:

| Action | Parameters | Description |
|--------|------------|-------------|
| drillToCluster | (cluster, context?) | Open cluster details |
| drillToNamespace | (cluster, namespace, context?) | Open namespace details |
| drillToPod | (cluster, namespace, pod, context?) | Open pod details |
| drillToDeployment | (cluster, namespace, deployment, context?) | Open deployment details |
| drillToService | (cluster, namespace, service, context?) | Open service details |
| drillToNode | (cluster, node, context?) | Open node details |
| drillToGPUNode | (cluster, node, context?) | Open GPU node details |
| drillToHelm | (cluster, namespace, release, context?) | Open Helm release details |
| drillToOperator | (cluster, namespace, operator, context?) | Open operator details |
| drillToArgoApp | (cluster, namespace, app, context?) | Open ArgoCD app details |
| drillToKustomization | (cluster, name, resource?, context?) | Open kustomization details |
| drillToDrift | (cluster, resource, context?) | Open GitOps drift details |
| drillToCost | (cluster, context?) | Open cost details |
| drillToRBAC | (cluster, namespace, name, context?) | Open RBAC details |
| drillToEvents | (cluster, namespace?, object?) | Open events view |
| drillToPVC | (cluster, namespace, pvc, context?) | Open PVC details |
| drillToAlert | (alertId, context?) | Open alert details |
| drillToPolicy | (cluster, policy, context?) | Open policy details |
