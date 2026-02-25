# KubeStellar Console - Complete Inventory

Last Updated: 2026-02-25  
Last Verified: 2026-02-25 (Auto-QA verification - all 25 drill-down views and 35 standalone modals confirmed present)

## Summary

| Category | Count |
|----------|-------|
| Dashboard Pages | 22 (1 main + 21 dedicated) |
| Card Types | 143 |
| Cards with Drill-Down | 37 (+ 3 planned) |
| Drill-Down Views | 25 |
| Modal Dialogs | 35 standalone + 7 inline |
| Stats Block Types | 93 (across 14 dashboard types) |
| Cards with Demo Data | 42 (29%) |
| Cards with Live Data Hooks | 101 (71%) |

---

## 1. Dashboard Pages (22 Total)

### Main Dashboard
| # | Name | Route | Component |
|---|------|-------|-----------|
| 1 | Main Dashboard | `/` | `Dashboard.tsx` |

### Dedicated Dashboards (21)
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
| 16 | Security Posture | `/security-posture` | `Compliance.tsx` |
| 17 | Data Compliance | `/data-compliance` | `DataCompliance.tsx` |
| 18 | GitOps | `/gitops` | `GitOps.tsx` |
| 19 | Alerts | `/alerts` | `Alerts.tsx` |
| 20 | Cost | `/cost` | `Cost.tsx` |
| 21 | Compliance | `/compliance` | `Compliance.tsx` |
| 22 | GPU Reservations | `/gpu-reservations` | `GPUReservations.tsx` |

### Utility Pages (Not counted as dashboards)
| Name | Route | Component |
|------|-------|-----------|
| Card History | `/history` | `CardHistory.tsx` |
| Settings | `/settings` | `Settings.tsx` |
| User Management | `/users` | `UserManagement.tsx` |
| Namespace Manager | `/namespaces` | `NamespaceManager.tsx` |

---

## 2. Card Types (110 Total)

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

### Category: AI (3 cards)
| # | Type | Title | Visualization |
|---|------|-------|---------------|
| 58 | `console_ai_issues` | AI Issues | status |
| 59 | `console_ai_kubeconfig_audit` | AI Kubeconfig Audit | status |
| 60 | `console_ai_health_check` | AI Health Check | gauge |

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

### Category: Games (22 cards)
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
| 110 | `kube_doom` | Kube Doom | interactive |

### Category: NEW - Kubernetes Resources (17 cards)
| # | Type | Title | Visualization | Demo Data |
|---|------|-------|---------------|-----------|
| 111 | `configmap_status` | ConfigMap Status | table | ❌ Live |
| 112 | `secret_status` | Secret Status | table | ❌ Live |
| 113 | `node_status` | Node Status | table | ❌ Live |
| 114 | `job_status` | Job Status | table | ❌ Live |
| 115 | `cronjob_status` | CronJob Status | table | ❌ Live |
| 116 | `daemonset_status` | DaemonSet Status | table | ❌ Live |
| 117 | `statefulset_status` | StatefulSet Status | table | ❌ Live |
| 118 | `replicaset_status` | ReplicaSet Status | table | ❌ Live |
| 119 | `hpa_status` | HPA Status | table | ❌ Live |
| 120 | `pv_status` | PV Status | table | ❌ Live |
| 121 | `ingress_status` | Ingress Status | table | ❌ Live |
| 122 | `namespace_status` | Namespace Status | table | ❌ Live |
| 123 | `limit_range_status` | LimitRange Status | table | ❌ Live |
| 124 | `resource_quota_status` | ResourceQuota Status | table | ❌ Live |
| 125 | `network_policy_status` | NetworkPolicy Status | table | ❌ Live |
| 126 | `service_account_status` | ServiceAccount Status | table | ❌ Live |
| 127 | `role_status` | Role Status | table | ❌ Live |
| 128 | `role_binding_status` | RoleBinding Status | table | ❌ Live |

### Category: NEW - Events & Monitoring (4 cards)
| # | Type | Title | Visualization | Demo Data |
|---|------|-------|---------------|-----------|
| 129 | `warning_events` | Warning Events | events | ❌ Live |
| 130 | `recent_events` | Recent Events | events | ❌ Live |
| 131 | `event_summary` | Event Summary | status | ✅ Demo |
| 132 | `provider_health` | Provider Health | status | ✅ Demo |

### Category: NEW - Deploy & GitOps (5 cards)
| # | Type | Title | Visualization | Demo Data |
|---|------|-------|---------------|-----------|
| 133 | `cluster_groups` | Cluster Groups | status | ✅ Demo |
| 134 | `deployment_missions` | Deployment Missions | status | ✅ Demo |
| 135 | `resource_marshall` | Resource Marshall | interactive | ❌ Live |
| 136 | `workload_deployment` | Workload Deployment | table | ❌ Live |
| 137 | `workload_monitor` | Workload Monitor | status | ❌ Live |

### Category: NEW - AI & Integrations (5 cards)
| # | Type | Title | Visualization | Demo Data |
|---|------|-------|---------------|-----------|
| 138 | `console_ai_offline_detection` | AI Offline Detection | status | ✅ Demo |
| 139 | `cluster_health_monitor` | Cluster Health Monitor | status | ❌ Live |
| 140 | `github_ci_monitor` | GitHub CI Monitor | status | ❌ Live |
| 141 | `prow_ci_monitor` | Prow CI Monitor | status | ❌ Live |
| 142 | `llmd_stack_monitor` | LLM-d Stack Monitor | status | ❌ Live |

### Category: NEW - Misc (3 cards)
| # | Type | Title | Visualization | Demo Data |
|---|------|-------|---------------|-----------|
| 143 | `dynamic_card` | Dynamic Card | dynamic | ❌ Live |
| 144 | `rss_feed` | RSS Feed | events | ✅ Demo |
| 145 | `pod_crosser` | Pod Crosser | interactive | ❌ Game |

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
- useDashboardContext: `web/src/hooks/useDashboardContext` (hook with provider)
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

## 7. Modal Dialogs (35 Standalone + 7 Inline)

### Standalone Modal Files

#### Dashboard-Related Modals (9)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 1 | AddCardModal | `dashboard/AddCardModal.tsx` | "Add Card" button | AI-powered modal for adding dashboard cards with "Browse Cards" and "AI Suggestions" tabs |
| 2 | ConfigureCardModal | `dashboard/ConfigureCardModal.tsx` | Card settings icon | Card configuration with toggles, cluster/namespace selectors, and AI suggestions |
| 3 | ReplaceCardModal | `dashboard/ReplaceCardModal.tsx` | Card replace action | Replace card with "Select" and "AI" tabs for choosing new card type |
| 4 | ResetDialog | `dashboard/ResetDialog.tsx` | Dashboard reset action | Two-option dialog: "Add Missing Cards" or "Replace All Cards" |
| 5 | TemplatesModal | `dashboard/TemplatesModal.tsx` | Templates selector | Dashboard template browser organized by category |
| 6 | CreateDashboardModal | `dashboard/CreateDashboardModal.tsx` | Create dashboard button | Create new dashboard with optional template selection |
| 7 | CardFactoryModal | `dashboard/CardFactoryModal.tsx` | Developer tools | Create custom cards with declarative, code, or AI-powered generation |
| 8 | StatBlockFactoryModal | `dashboard/StatBlockFactoryModal.tsx` | Developer tools | Create custom stat blocks with builder or AI assistance |
| 9 | CardConfigModal | `clusters/components/CardConfigModal.tsx` | Legacy card settings | Simple card configuration for cluster filtering |

### Cluster Management Modals (8)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 10 | ClusterDetailModal | `clusters/ClusterDetailModal.tsx` | Click cluster in list | Comprehensive cluster details: health, metrics, nodes, workloads, GPU inventory |
| 11 | AddClusterDialog | `clusters/AddClusterDialog.tsx` | "Add Cluster" button | Add a new cluster via Command-Line instructions, kubeconfig Import, or remote Connect tabs |
| 12 | RenameModal | `clusters/components/RenameModal.tsx` | Pencil icon on cluster | Rename kubeconfig context display name |
| 13 | GPUDetailModal | `clusters/components/GPUDetailModal.tsx` | GPU stat click (standalone) | Full-featured GPU resource details: inventory, specs, utilization, operator status, multi-cluster view |
| 14 | CPUDetailModal | `clusters/ResourceDetailModals.tsx` | CPU stat click (in cluster detail) | CPU resource details per node with allocation and utilization |
| 15 | MemoryDetailModal | `clusters/ResourceDetailModals.tsx` | Memory stat click (in cluster detail) | Memory resource details per node with allocation and utilization |
| 16 | StorageDetailModal | `clusters/ResourceDetailModals.tsx` | Storage stat click (in cluster detail) | Storage resource details per node with capacity and usage |
| 17 | GPUDetailModal (cluster view) | `clusters/ResourceDetailModals.tsx` | GPU stat in cluster detail modal | Simplified GPU details for single-cluster context within ClusterDetailModal |

### Navigation/Exploration Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 18 | DrillDownModal | `drilldown/DrillDownModal.tsx` | Click resources in cards | Hierarchical navigation for Kubernetes resources with breadcrumbs |

### Feature/Feedback Modals (2)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 19 | FeatureRequestModal | `feedback/FeatureRequestModal.tsx` | Feedback button | Submit feature requests and track updates with GitHub integration |
| 20 | FeedbackModal | `feedback/FeedbackModal.tsx` | Feedback button | Submit bugs or feature requests via GitHub Issues |

### Setup/Onboarding Modals (2)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 21 | AgentSetupDialog | `agent/AgentSetupDialog.tsx` | Auto on app load (if agent not connected) | Install KubeStellar Console agent with quick install command |
| 22 | SetupInstructionsDialog | `setup/SetupInstructionsDialog.tsx` | Help/Setup menu | Full setup instructions with copy-paste commands and OAuth configuration |

### Deployment Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 23 | DeployConfirmDialog | `deploy/DeployConfirmDialog.tsx` | Deploy workload action | Confirm deployment with dependency resolution and target cluster selection |

### GitOps Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 24 | SyncDialog | `gitops/SyncDialog.tsx` | GitOps sync action | Multi-phase sync workflow: Detection → Plan → Execute → Complete |

### Mission/Resolution Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 25 | SaveResolutionDialog | `missions/SaveResolutionDialog.tsx` | Save resolution action | Save successful mission resolution for future reference |

### Alerts Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 26 | AlertRuleEditor | `alerts/AlertRuleEditor.tsx` | Add/Edit alert rule | Create or edit alert rules with conditions, severity, and notification channels |

### Stats Configuration Modals (2)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 27 | StatsConfigModal | `clusters/components/StatsConfig.tsx` | Stats settings icon | Configure visible stats and drag-drop reordering for stat blocks |
| 28 | StatsConfigModal (UI) | `ui/StatsConfig.tsx` | Stats settings icon | Alternative stats configuration component |

### API Key & Settings Modals (2)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 29 | APIKeySettings | `agent/APIKeySettings.tsx` | Settings > API Keys | Configure AI provider API keys (Claude, OpenAI, Gemini) with validation and status |
| 30 | ApiKeyPromptModal | `cards/console-missions/shared.tsx` | AI feature without key | Prompt to configure API key when AI features are used without credentials |

### Widget & Export Modals (1)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 31 | WidgetExportModal | `widgets/WidgetExportModal.tsx` | Export menu | Export dashboard cards as standalone desktop widgets for Übersicht and other platforms |

### Utility Modals (4)
| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 32 | BaseModal | `lib/modals/BaseModal.tsx` | N/A (Base component) | Base modal component providing consistent styling and keyboard navigation |
| 33 | ConfirmDialog | `lib/modals/ConfirmDialog.tsx` | Various actions | Reusable confirmation dialog with danger/warning/info variants |
| 34 | ModalRuntime | `lib/modals/ModalRuntime.tsx` | N/A (Runtime engine) | Declarative modal renderer; interprets modal definitions (future: YAML-based) and renders them consistently |
| 35 | ModalSections | `lib/modals/ModalSections.tsx` | N/A (Component library) | Reusable section components (KeyValueSection, TableSection, etc.) composable in modals |

---

### Inline Modals (6 Total)

These modals are defined within card/page components rather than as standalone files:

| # | Name | File | Trigger | Description |
|---|------|------|---------|-------------|
| 1 | PolicyDetailModal | `cards/OPAPolicies.tsx` | Click policy in OPA card | Display policy details, violations, and enforcement mode with option to create similar |
| 2 | ClusterOPAModal | `cards/OPAPolicies.tsx` | Click violations count | Full cluster OPA status with policies and violations management |
| 3 | QuotaModal | `cards/NamespaceQuotas.tsx` | Add/Edit quota button | Create or edit namespace resource quotas with GPU presets |
| 4 | ResourceDetailModal | `clusters/Clusters.tsx` | Click pod/event item | Generic resource details with tabs: Overview/Labels/Related/Describe/Logs/Events/YAML |
| 5 | GitHubInviteModal | `rewards/GitHubInvite.tsx` | Invite action | Invite users to GitHub repository and earn coins in rewards system |
| 6 | Violations Display | `cards/OPAPolicies.tsx` | Policy violation actions | Shows policy violation details rendered in BaseModal (not a separate modal component) |

**Note:** The GPUDetailModal exported from `ResourceDetailModals.tsx` is listed as standalone modal #16 above, not as an inline modal.

### Modal Features
- All modals support ESC key to close
- Use React portals for proper z-index layering
- Feature blur backdrop overlays
- Most support keyboard navigation

---

## 8. Drill-Down Views (25 Total)

Drill-down views are displayed within `DrillDownModal` when clicking items in cards.

| # | View | File | Triggered By |
|---|------|------|--------------|
| 1 | AlertDrillDown | `drilldown/views/AlertDrillDown.tsx` | ActiveAlerts card |
| 2 | ArgoAppDrillDown | `drilldown/views/ArgoAppDrillDown.tsx` | ArgoCDApplications card |
| 3 | BuildpackDrillDown | `drilldown/views/BuildpackDrillDown.tsx` | BuildpacksStatus card |
| 4 | ClusterDrillDown | `drilldown/views/ClusterDrillDown.tsx` | Cluster items in various cards |
| 5 | ConfigMapDrillDown | `drilldown/views/ConfigMapDrillDown.tsx` | ConfigMap resources |
| 6 | CRDDrillDown | `drilldown/views/CRDDrillDown.tsx` | CRDHealth card |
| 7 | DeploymentDrillDown | `drilldown/views/DeploymentDrillDown.tsx` | DeploymentStatus, DeploymentIssues |
| 8 | DriftDrillDown | `drilldown/views/DriftDrillDown.tsx` | GitOpsDrift card |
| 9 | EventsDrillDown | `drilldown/views/EventsDrillDown.tsx` | EventStream, NamespaceEvents |
| 10 | GPUNamespaceDrillDown | `drilldown/views/GPUNamespaceDrillDown.tsx` | GPUNamespaceAllocations card |
| 11 | GPUNodeDrillDown | `drilldown/views/GPUNodeDrillDown.tsx` | GPUInventory, GPUStatus cards |
| 12 | HelmReleaseDrillDown | `drilldown/views/HelmReleaseDrillDown.tsx` | HelmReleaseStatus, HelmHistory |
| 13 | KustomizationDrillDown | `drilldown/views/KustomizationDrillDown.tsx` | KustomizationStatus, OverlayComparison |
| 14 | LogsDrillDown | `drilldown/views/LogsDrillDown.tsx` | Pod logs access |
| 15 | MultiClusterSummaryDrillDown | `drilldown/views/MultiClusterSummaryDrillDown.tsx` | All-clusters, all-namespaces, all-deployments, all-pods views |
| 16 | NamespaceDrillDown | `drilldown/views/NamespaceDrillDown.tsx` | NamespaceOverview card |
| 17 | NodeDrillDown | `drilldown/views/NodeDrillDown.tsx` | Node items in ComputeOverview |
| 18 | OperatorDrillDown | `drilldown/views/OperatorDrillDown.tsx` | OperatorStatus, OperatorSubscriptions |
| 19 | PodDrillDown | `drilldown/views/PodDrillDown.tsx` | TopPods, PodIssues cards |
| 20 | PolicyDrillDown | `drilldown/views/PolicyDrillDown.tsx` | OPAPolicies, KyvernoPolicies |
| 21 | ReplicaSetDrillDown | `drilldown/views/ReplicaSetDrillDown.tsx` | ReplicaSet resources |
| 22 | ResourcesDrillDown | `drilldown/views/ResourcesDrillDown.tsx` | Generic resource drill-down |
| 23 | SecretDrillDown | `drilldown/views/SecretDrillDown.tsx` | Secret resources |
| 24 | ServiceAccountDrillDown | `drilldown/views/ServiceAccountDrillDown.tsx` | RBAC service accounts |
| 25 | YAMLDrillDown | `drilldown/views/YAMLDrillDown.tsx` | YAML view for any resource |

---

## 9. Cards with Drill-Down (37 with actual views + 3 planned)

Cards that have `useDrillDownActions` hook for clickable items:

| # | Card | Drill Action | Target View | Status |
|---|------|--------------|-------------|--------|
| 1 | AppStatus | drillToDeployment | DeploymentDrillDown | ✓ |
| 2 | ArgoCDApplications | drillToArgoApp | ArgoAppDrillDown | ✓ |
| 3 | ClusterComparison | drillToCluster | ClusterDrillDown | ✓ |
| 4 | ClusterCosts | drillToCost | CostDrillDown | **Planned** |
| 5 | ClusterFocus | drillToCluster | ClusterDrillDown | ✓ |
| 6 | ClusterResourceTree | drillToNamespace/Pod | NamespaceDrillDown/PodDrillDown | ✓ |
| 7 | ComputeOverview | drillToNode | NodeDrillDown | ✓ |
| 8 | DeploymentIssues | drillToDeployment | DeploymentDrillDown | ✓ |
| 9 | DeploymentProgress | drillToDeployment | DeploymentDrillDown | ✓ |
| 10 | DeploymentStatus | drillToDeployment | DeploymentDrillDown | ✓ |
| 11 | EventStream | drillToEvents | EventsDrillDown | ✓ |
| 12 | GitOpsDrift | drillToDrift | DriftDrillDown | ✓ |
| 13 | GPUInventory | drillToGPUNode | GPUNodeDrillDown | ✓ |
| 14 | GPUOverview | drillToGPUNode | GPUNodeDrillDown | ✓ |
| 15 | GPUStatus | drillToCluster | ClusterDrillDown | ✓ |
| 16 | GPUWorkloads | drillToPod | PodDrillDown | ✓ |
| 17 | HelmHistory | drillToHelm | HelmReleaseDrillDown | ✓ |
| 18 | HelmReleaseStatus | drillToHelm | HelmReleaseDrillDown | ✓ |
| 19 | HelmValuesDiff | drillToHelm | HelmReleaseDrillDown | ✓ |
| 20 | KubecostOverview | drillToCost | CostDrillDown | **Planned** |
| 21 | KustomizationStatus | drillToKustomization | KustomizationDrillDown | ✓ |
| 22 | NamespaceEvents | drillToEvents | EventsDrillDown | ✓ |
| 23 | NamespaceOverview | drillToNamespace | NamespaceDrillDown | ✓ |
| 24 | NamespaceRBAC | drillToRBAC | ServiceAccountDrillDown | ✓ |
| 25 | NetworkOverview | drillToService | ServiceDrillDown | **Planned** |
| 26 | OpenCostOverview | drillToCost | CostDrillDown | **Planned** |
| 27 | OperatorStatus | drillToOperator | OperatorDrillDown | ✓ |
| 28 | OperatorSubscriptions | drillToOperator | OperatorDrillDown | ✓ |
| 29 | OverlayComparison | drillToKustomization | KustomizationDrillDown | ✓ |
| 30 | PodIssues | drillToPod | PodDrillDown | ✓ |
| 31 | PVCStatus | drillToPVC | PVCDrillDown | **Planned** |
| 32 | ResourceCapacity | drillToNode | NodeDrillDown | ✓ |
| 33 | ResourceUsage | drillToNode | NodeDrillDown | ✓ |
| 34 | SecurityIssues | drillToPod | PodDrillDown | ✓ |
| 35 | ServiceStatus | drillToService | ServiceDrillDown | **Planned** |
| 36 | StorageOverview | drillToPVC | PVCDrillDown | **Planned** |
| 37 | TopPods | drillToPod | PodDrillDown | ✓ |
| 38 | UpgradeStatus | drillToCluster | ClusterDrillDown | ✓ |
| 39 | UserManagement | drillToRBAC | ServiceAccountDrillDown | ✓ |

**Note**: Cards marked as "Planned" reference drill-down views that don't yet exist as separate files. They may use generic ResourcesDrillDown or open inline views until dedicated drill-down components are implemented.

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
| useModalAI | AI Assistant integration for modals |

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
| drillToGPUNamespace | (namespace, gpuData?) | Open GPU namespace allocation details |
| drillToBuildpack | (cluster, namespace, name, buildpackData?) | Open buildpack/kpack build details |
| drillToAlert | (alertId, context?) | Open alert details |
| drillToPolicy | (cluster, policy, context?) | Open policy details |
