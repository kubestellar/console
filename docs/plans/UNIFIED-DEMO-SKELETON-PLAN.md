# Unified Demo & Skeleton System Implementation Plan

## Context

The KubeStellar Console has 143 cards, 93 stat blocks, 22 dashboards, and 37 modals. Currently:
- Demo mode exists (`useDemoMode.ts`) but is not consistently applied
- Skeleton components exist (`Skeleton.tsx`) but are not uniformly used
- Some cards have demo data, many don't
- Switching between demo/live mode doesn't show skeletons consistently
- Cards can appear empty or in undefined states

**Goal:** Every UI component shows a skeleton with animated refresh icon until data (demo or live) is populated. Mode switching triggers immediate skeleton display. A centralized UnifiedDemo component manages all demo data.

---

## Architecture

### New Component: `UnifiedDemo`
Location: `web/src/lib/unified/demo/`

```
demo/
├── UnifiedDemo.tsx          # Context provider for demo data
├── UnifiedDemoContext.ts    # React context
├── demoDataRegistry.ts      # Registry of all demo data generators
├── types.ts                 # Demo data types
└── generators/              # Per-component demo data
    ├── cards/               # Demo data for each card type
    ├── stats/               # Demo data for each stat block
    ├── dashboards/          # Demo data for dashboard layouts
    └── modals/              # Demo data for modals
```

### Integration Points
1. **UnifiedCard** - Wrap with UnifiedDemo, show skeleton until demo/live data ready
2. **UnifiedStatBlock** - Same pattern
3. **UnifiedStatsSection** - Propagate loading state to all blocks
4. **UnifiedDashboard** - Coordinate skeleton states across all cards

### Skeleton Behavior
- Show skeleton with `animate-spin` refresh icon when:
  - Initial load (no data yet)
  - Switching from demo→live mode
  - Switching from live→demo mode
  - Data refresh in progress
- Use cached data for instant display when switching to live mode
- Cards populate independently (no global "all cards loaded" state)

---

## Tasks

### Phase 1: Core Infrastructure

#### Task 1.1: Create UnifiedDemo Component
- [ ] Create `web/src/lib/unified/demo/UnifiedDemo.tsx`
- [ ] Create `UnifiedDemoContext.ts` with provider
- [ ] Create `demoDataRegistry.ts` for registering demo data generators
- [ ] Create `types.ts` with demo data interfaces
- [ ] Integrate with existing `useDemoMode` hook
- [ ] Handle mode switching with skeleton transition

#### Task 1.2: Update UnifiedCard for Skeleton/Demo
- [ ] Add skeleton state that shows until data ready
- [ ] Add refresh icon animation during skeleton
- [ ] Integrate with UnifiedDemo context
- [ ] Support independent population per card
- [ ] Never show empty state (skeleton or data only)

#### Task 1.3: Update UnifiedStatBlock for Skeleton/Demo
- [ ] Add skeleton with refresh animation
- [ ] Integrate with UnifiedDemo context
- [ ] Support independent population

#### Task 1.4: Update Skeleton Components
- [ ] Add refresh icon animation to all skeleton variants
- [ ] Create `SkeletonWithRefresh` wrapper component
- [ ] Ensure animations run during all loading states

---

### Phase 2: Dashboard Demo Data & Skeletons

#### Task 2.1: Main Dashboard (`Dashboard.tsx`)
- [ ] Add demo data for all cards
- [ ] Implement skeleton states
- [ ] Test mode switching

#### Task 2.2: Clusters Dashboard (`Clusters.tsx`)
- [ ] Demo data: 12 clusters with varied states
- [ ] Stats: clusters, healthy, unhealthy, offline, nodes, cpus, memory, storage, gpus, pods
- [ ] Skeleton for cluster cards and stats

#### Task 2.3: Workloads Dashboard (`Workloads.tsx`)
- [ ] Demo data: deployments, pods, services
- [ ] Stats: namespaces, critical, warning, healthy, deployments, pod_issues, deployment_issues
- [ ] Skeleton states

#### Task 2.4: Pods Dashboard (`Pods.tsx`)
- [ ] Demo data: varied pod states
- [ ] Stats: total_pods, healthy, issues, pending, restarts, clusters
- [ ] Skeleton states

#### Task 2.5: Nodes Dashboard (`Nodes.tsx`)
- [ ] Demo data: node resources
- [ ] Skeleton states

#### Task 2.6: Deployments Dashboard (`Deployments.tsx`)
- [ ] Demo data: deployment statuses
- [ ] Skeleton states

#### Task 2.7: Services Dashboard (`Services.tsx`)
- [ ] Demo data: service types
- [ ] Skeleton states

#### Task 2.8: Operators Dashboard (`Operators.tsx`)
- [ ] Demo data: OLM operators
- [ ] Stats: operators, installed, installing, failing, upgrades, subscriptions, crds, clusters
- [ ] Skeleton states

#### Task 2.9: Helm Releases Dashboard (`HelmReleases.tsx`)
- [ ] Demo data: releases, charts
- [ ] Skeleton states

#### Task 2.10: Logs Dashboard (`Logs.tsx`)
- [ ] Demo data: log entries
- [ ] Skeleton states

#### Task 2.11: Compute Dashboard (`Compute.tsx`)
- [ ] Demo data: compute resources
- [ ] Stats: nodes, cpus, memory, gpus, tpus, pods, cpu_util, memory_util
- [ ] Skeleton states

#### Task 2.12: Storage Dashboard (`Storage.tsx`)
- [ ] Demo data: PVCs, storage classes
- [ ] Stats: ephemeral, pvcs, bound, pending, storage_classes
- [ ] Skeleton states

#### Task 2.13: Network Dashboard (`Network.tsx`)
- [ ] Demo data: services, ingresses
- [ ] Stats: services, loadbalancers, nodeport, clusterip, ingresses, endpoints
- [ ] Skeleton states

#### Task 2.14: Events Dashboard (`Events.tsx`)
- [ ] Demo data: warning/normal events
- [ ] Stats: total, warnings, normal, recent, errors
- [ ] Skeleton states

#### Task 2.15: Security Dashboard (`Security.tsx`)
- [ ] Demo data: security issues
- [ ] Stats: issues, critical, high, medium, low, privileged, root
- [ ] Skeleton states

#### Task 2.16: Security Posture Dashboard (`Compliance.tsx`)
- [ ] Demo data: compliance checks
- [ ] Stats: score, total_checks, passing, failing, warning, critical_findings
- [ ] Skeleton states

#### Task 2.17: Data Compliance Dashboard (`DataCompliance.tsx`)
- [ ] Demo data: secrets, certs
- [ ] Skeleton states

#### Task 2.18: GitOps Dashboard (`GitOps.tsx`)
- [ ] Demo data: helm, kustomize, operators
- [ ] Stats: total, helm, kustomize, operators, deployed, failed, pending, other
- [ ] Skeleton states

#### Task 2.19: Alerts Dashboard (`Alerts.tsx`)
- [ ] Demo data: alert rules, firing alerts
- [ ] Stats: firing, pending, resolved, rules_enabled, rules_disabled
- [ ] Skeleton states

#### Task 2.20: Cost Dashboard (`Cost.tsx`)
- [ ] Demo data: cost breakdown
- [ ] Stats: total_cost, cpu_cost, memory_cost, storage_cost, network_cost, gpu_cost
- [ ] Skeleton states

#### Task 2.21: GPU Reservations Dashboard (`GPUReservations.tsx`)
- [ ] Demo data: GPU allocations
- [ ] Skeleton states

#### Task 2.22: Utility Dashboards
- [ ] Card History (`CardHistory.tsx`)
- [ ] Settings (`Settings.tsx`)
- [ ] User Management (`UserManagement.tsx`)
- [ ] Namespace Manager (`NamespaceManager.tsx`)

---

### Phase 3: Card Demo Data & Skeletons (143 Cards)

#### Task 3.1: Cluster Health Cards (8)
- [ ] cluster_health, cluster_metrics, cluster_focus, cluster_comparison
- [ ] cluster_costs, upgrade_status, cluster_resource_tree, cluster_locations

#### Task 3.2: Workload Cards (7)
- [ ] deployment_status, deployment_issues, deployment_progress
- [ ] pod_issues, top_pods, app_status, workload_deployment

#### Task 3.3: Compute Cards (8)
- [ ] compute_overview, resource_usage, resource_capacity
- [ ] gpu_overview, gpu_status, gpu_inventory, gpu_workloads, gpu_usage_trend

#### Task 3.4: Storage Cards (2)
- [ ] storage_overview, pvc_status

#### Task 3.5: Network Cards (7)
- [ ] network_overview, service_status, cluster_network
- [ ] service_exports, service_imports, gateway_status, service_topology

#### Task 3.6: GitOps Cards (7)
- [ ] helm_release_status, helm_history, helm_values_diff, chart_versions
- [ ] kustomization_status, overlay_comparison, gitops_drift

#### Task 3.7: ArgoCD Cards (3)
- [ ] argocd_applications, argocd_sync_status, argocd_health

#### Task 3.8: Operator Cards (3)
- [ ] operator_status, operator_subscriptions, crd_health

#### Task 3.9: Namespace Cards (5)
- [ ] namespace_overview, namespace_quotas, namespace_rbac
- [ ] namespace_events, namespace_monitor

#### Task 3.10: Security & Events Cards (3)
- [ ] security_issues, event_stream, user_management

#### Task 3.11: Live Trends Cards (4)
- [ ] events_timeline, pod_health_trend, resource_trend, gpu_utilization

#### Task 3.12: AI Cards (3)
- [ ] console_ai_issues, console_ai_kubeconfig_audit, console_ai_health_check

#### Task 3.13: Alerting Cards (2)
- [ ] active_alerts, alert_rules

#### Task 3.14: Cost Cards (2)
- [ ] opencost_overview, kubecost_overview

#### Task 3.15: Policy Cards (2)
- [ ] opa_policies, kyverno_policies

#### Task 3.16: Compliance Cards (5)
- [ ] falco_alerts, trivy_scan, kubescape_scan, policy_violations, compliance_score

#### Task 3.17: Data Compliance Cards (3)
- [ ] vault_secrets, external_secrets, cert_manager

#### Task 3.18: Workload Detection Cards (7)
- [ ] prow_jobs, prow_status, prow_history
- [ ] llm_inference, llm_models, ml_jobs, ml_notebooks

#### Task 3.19: External Integration Cards (2)
- [ ] github_activity, weather

#### Task 3.20: Utility Cards (5)
- [ ] kubectl, iframe_embed, network_utils, mobile_browser, stock_market_ticker

#### Task 3.21: Game Cards (22)
- [ ] All game cards need loading skeletons (games can show "Loading game..." skeleton)

#### Task 3.22: Kubernetes Resource Cards (18)
- [ ] configmap_status, secret_status, node_status, job_status, cronjob_status
- [ ] daemonset_status, statefulset_status, replicaset_status, hpa_status, pv_status
- [ ] ingress_status, namespace_status, limit_range_status, resource_quota_status
- [ ] network_policy_status, service_account_status, role_status, role_binding_status

#### Task 3.23: Events & Monitoring Cards (4)
- [ ] warning_events, recent_events, event_summary, provider_health

#### Task 3.24: Deploy & GitOps Cards (5)
- [ ] cluster_groups, deployment_missions, resource_marshall
- [ ] workload_deployment, workload_monitor

#### Task 3.25: AI & Integration Cards (5)
- [ ] console_ai_offline_detection, cluster_health_monitor
- [ ] github_ci_monitor, prow_ci_monitor, llmd_stack_monitor

#### Task 3.26: Misc Cards (3)
- [ ] dynamic_card, rss_feed, pod_crosser

---

### Phase 4: Stat Block Demo Data & Skeletons (93 Stats)

#### Task 4.1: Clusters Dashboard Stats (10)
- [ ] clusters, healthy, unhealthy, unreachable, nodes, cpus, memory, storage, gpus, pods

#### Task 4.2: Workloads Dashboard Stats (7)
- [ ] namespaces, critical, warning, healthy, deployments, pod_issues, deployment_issues

#### Task 4.3: Pods Dashboard Stats (6)
- [ ] total_pods, healthy, issues, pending, restarts, clusters

#### Task 4.4: GitOps Dashboard Stats (8)
- [ ] total, helm, kustomize, operators, deployed, failed, pending, other

#### Task 4.5: Storage Dashboard Stats (5)
- [ ] ephemeral, pvcs, bound, pending, storage_classes

#### Task 4.6: Network Dashboard Stats (6)
- [ ] services, loadbalancers, nodeport, clusterip, ingresses, endpoints

#### Task 4.7: Security Dashboard Stats (7)
- [ ] issues, critical, high, medium, low, privileged, root

#### Task 4.8: Compliance Dashboard Stats (6)
- [ ] score, total_checks, passing, failing, warning, critical_findings

#### Task 4.9: Compute Dashboard Stats (8)
- [ ] nodes, cpus, memory, gpus, tpus, pods, cpu_util, memory_util

#### Task 4.10: Events Dashboard Stats (5)
- [ ] total, warnings, normal, recent, errors

#### Task 4.11: Cost Dashboard Stats (6)
- [ ] total_cost, cpu_cost, memory_cost, storage_cost, network_cost, gpu_cost

#### Task 4.12: Alerts Dashboard Stats (5)
- [ ] firing, pending, resolved, rules_enabled, rules_disabled

#### Task 4.13: Main Dashboard Stats (6)
- [ ] clusters, healthy, warnings, errors, namespaces, pods

#### Task 4.14: Operators Dashboard Stats (8)
- [ ] operators, installed, installing, failing, upgrades, subscriptions, crds, clusters

---

### Phase 5: Modal Demo Data & Skeletons (37 Modals)

#### Task 5.1: Dashboard Modals (9)
- [ ] AddCardModal, ConfigureCardModal, ReplaceCardModal, ResetDialog
- [ ] TemplatesModal, CreateDashboardModal, CardFactoryModal
- [ ] StatBlockFactoryModal, CardConfigModal

#### Task 5.2: Cluster Management Modals (6)
- [ ] ClusterDetailModal, RenameModal, GPUDetailModal
- [ ] CPUDetailModal, MemoryDetailModal, StorageDetailModal

#### Task 5.3: Other Modals (14)
- [ ] DrillDownModal, FeatureRequestModal, FeedbackModal
- [ ] AgentSetupDialog, SetupInstructionsDialog, DeployConfirmDialog
- [ ] SyncDialog, SaveResolutionDialog, AlertRuleEditor
- [ ] StatsConfigModal (x2), APIKeySettings, ApiKeyPromptModal, WidgetExportModal

#### Task 5.4: Inline Modals (8)
- [ ] PolicyDetailModal, ClusterOPAModal, QuotaModal, ResourceDetailModal
- [ ] GPUDetailModal (alt), InstallModal, GitHubInviteModal, ViolationsModal

---

### Phase 6: Drill-Down Demo Data & Skeletons (23 Views)

#### Task 6.1: Resource Drill-Downs
- [ ] ClusterDrillDown, NodeDrillDown, PodDrillDown, DeploymentDrillDown
- [ ] NamespaceDrillDown, ServiceAccountDrillDown

#### Task 6.2: GitOps Drill-Downs
- [ ] HelmReleaseDrillDown, KustomizationDrillDown, ArgoAppDrillDown, DriftDrillDown

#### Task 6.3: Config Drill-Downs
- [ ] ConfigMapDrillDown, SecretDrillDown, CRDDrillDown, YAMLDrillDown

#### Task 6.4: Monitoring Drill-Downs
- [ ] AlertDrillDown, EventsDrillDown, LogsDrillDown

#### Task 6.5: Compute Drill-Downs
- [ ] GPUNodeDrillDown, ResourcesDrillDown

#### Task 6.6: Other Drill-Downs
- [ ] OperatorDrillDown, PolicyDrillDown, ReplicaSetDrillDown, MultiClusterSummaryDrillDown

---

### Phase 7: Testing & Verification

#### Task 7.1: Unit Tests
- [ ] Test UnifiedDemo context provider
- [ ] Test skeleton rendering for each component type
- [ ] Test mode switching triggers skeleton

#### Task 7.2: Integration Tests
- [ ] Test demo→live mode transition shows skeleton then live data
- [ ] Test live→demo mode transition shows skeleton then demo data
- [ ] Test cached data loads instantly on live mode switch
- [ ] Test refresh icon animates during all loading states

#### Task 7.3: E2E Tests (Playwright)
- [ ] Test all dashboards show skeletons on initial load
- [ ] Test mode toggle behavior
- [ ] Test no empty card states

#### Task 7.4: Visual Verification (Chrome DevTools MCP)
- [ ] Screenshot each dashboard in skeleton state
- [ ] Screenshot each dashboard with demo data
- [ ] Verify refresh animations work

---

## Files to Modify

### New Files
- `web/src/lib/unified/demo/UnifiedDemo.tsx`
- `web/src/lib/unified/demo/UnifiedDemoContext.ts`
- `web/src/lib/unified/demo/demoDataRegistry.ts`
- `web/src/lib/unified/demo/types.ts`
- `web/src/lib/unified/demo/generators/cards/*.ts` (143 files)
- `web/src/lib/unified/demo/generators/stats/*.ts` (14 files)

### Modified Files
- `web/src/lib/unified/card/UnifiedCard.tsx`
- `web/src/lib/unified/stats/UnifiedStatBlock.tsx`
- `web/src/lib/unified/stats/UnifiedStatsSection.tsx`
- `web/src/lib/unified/dashboard/UnifiedDashboard.tsx`
- `web/src/components/ui/Skeleton.tsx`
- All 22 dashboard components
- All 143 card components
- All 37 modal components
- All 23 drill-down components

---

## Verification

### Starting the Environment
```bash
# ALWAYS use startup-oauth.sh to start/restart BE/FE/agent
./startup-oauth.sh
```

### Testing with Chrome DevTools MCP
All UI testing MUST use Chrome DevTools MCP tools:
- `mcp__chrome-devtools__navigate_page` - Load pages
- `mcp__chrome-devtools__take_snapshot` - Verify DOM elements
- `mcp__chrome-devtools__click` / `mcp__chrome-devtools__fill` - Interact
- `mcp__chrome-devtools__take_screenshot` - Capture visual state
- `mcp__chrome-devtools__list_console_messages` - Check for errors

### Test Cases

1. **Manual Testing (via Chrome MCP):**
   - Toggle demo mode and verify skeletons appear immediately
   - Verify all cards show skeleton until data loads
   - Verify refresh icon animates during loading
   - Verify no empty/minimized cards (unless user-minimized)

2. **Automated Testing:**
   - Run `npm run test` for unit tests
   - Run `npx playwright test` for E2E tests

3. **Per-Component Verification:**
   - Navigate to each dashboard
   - Take snapshots to verify DOM structure
   - Take screenshots to verify visual state
   - Check console for errors

---

## Summary

- **Total Tasks:** 70+ individual tasks
- **Components to Update:** 225+ (22 dashboards + 143 cards + 37 modals + 23 drill-downs)
- **New Infrastructure:** UnifiedDemo system with demo data registry
- **Key Behavior:** Skeleton with refresh animation until data ready, mode switching triggers immediate skeleton
