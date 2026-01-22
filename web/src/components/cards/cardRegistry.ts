import React from 'react'
import { ClusterHealth } from './ClusterHealth'
import { EventStream } from './EventStream'
import { PodIssues } from './PodIssues'
import { TopPods } from './TopPods'
import { AppStatus } from './AppStatus'
import { ResourceUsage } from './ResourceUsage'
import { ClusterMetrics } from './ClusterMetrics'
import { DeploymentStatus } from './DeploymentStatus'
import { DeploymentProgress } from './DeploymentProgress'
import { DeploymentIssues } from './DeploymentIssues'
import { GitOpsDrift } from './GitOpsDrift'
import { UpgradeStatus } from './UpgradeStatus'
import { ResourceCapacity } from './ResourceCapacity'
import { GPUInventory } from './GPUInventory'
import { GPUStatus } from './GPUStatus'
import { GPUOverview } from './GPUOverview'
import { GPUWorkloads } from './GPUWorkloads'
import { SecurityIssues } from './SecurityIssues'
// Live data trend cards
import { EventsTimeline } from './EventsTimeline'
import { PodHealthTrend } from './PodHealthTrend'
import { ResourceTrend } from './ResourceTrend'
import { GPUUtilization } from './GPUUtilization'
import { GPUUsageTrend } from './GPUUsageTrend'
import { ClusterResourceTree } from './ClusterResourceTree'
// Dashboard-specific cards
import { StorageOverview } from './StorageOverview'
import { PVCStatus } from './PVCStatus'
import { NetworkOverview } from './NetworkOverview'
import { ServiceStatus } from './ServiceStatus'
import { ComputeOverview } from './ComputeOverview'
// Cluster-scoped cards
import { ClusterFocus } from './ClusterFocus'
import { ClusterComparison } from './ClusterComparison'
import { ClusterCosts } from './ClusterCosts'
import { ClusterNetwork } from './ClusterNetwork'
// Namespace-scoped cards
import { NamespaceOverview } from './NamespaceOverview'
import { NamespaceQuotas } from './NamespaceQuotas'
import { NamespaceRBAC } from './NamespaceRBAC'
import { NamespaceEvents } from './NamespaceEvents'
// Operator-scoped cards
import { OperatorStatus } from './OperatorStatus'
import { OperatorSubscriptions } from './OperatorSubscriptions'
import { CRDHealth } from './CRDHealth'
// Helm-scoped cards
import { HelmReleaseStatus } from './HelmReleaseStatus'
import { HelmValuesDiff } from './HelmValuesDiff'
import { HelmHistory } from './HelmHistory'
import { ChartVersions } from './ChartVersions'
// Kustomize-scoped cards
import { KustomizationStatus } from './KustomizationStatus'
import { OverlayComparison } from './OverlayComparison'
// ArgoCD cards
import { ArgoCDApplications } from './ArgoCDApplications'
import { ArgoCDSyncStatus } from './ArgoCDSyncStatus'
import { ArgoCDHealth } from './ArgoCDHealth'
// User management card
import { UserManagement } from './UserManagement'
// Klaude AI mission cards
import { KlaudeIssuesCard, KlaudeKubeconfigAuditCard, KlaudeHealthCheckCard } from './KlaudeMissions'
// Alerting cards
import { ActiveAlerts } from './ActiveAlerts'
import { AlertRulesCard } from './AlertRules'
// Cost management integrations
import { OpenCostOverview } from './OpenCostOverview'
import { KubecostOverview } from './KubecostOverview'
// Policy management cards
import { OPAPolicies } from './OPAPolicies'
import { KyvernoPolicies } from './KyvernoPolicies'

// Type for card component props
export type CardComponentProps = { config?: Record<string, unknown> }

// Card component type
export type CardComponent = React.ComponentType<CardComponentProps>

/**
 * Central registry of all card components.
 * Add new cards here and they will automatically be available in all dashboards.
 */
export const CARD_COMPONENTS: Record<string, CardComponent> = {
  // Core cards
  cluster_health: ClusterHealth,
  event_stream: EventStream,
  pod_issues: PodIssues,
  top_pods: TopPods,
  app_status: AppStatus,
  resource_usage: ResourceUsage,
  cluster_metrics: ClusterMetrics,
  deployment_status: DeploymentStatus,
  deployment_progress: DeploymentProgress,
  deployment_issues: DeploymentIssues,
  gitops_drift: GitOpsDrift,
  upgrade_status: UpgradeStatus,
  resource_capacity: ResourceCapacity,
  gpu_inventory: GPUInventory,
  gpu_status: GPUStatus,
  gpu_overview: GPUOverview,
  gpu_workloads: GPUWorkloads,
  security_issues: SecurityIssues,
  // Live data trend cards
  events_timeline: EventsTimeline,
  pod_health_trend: PodHealthTrend,
  resource_trend: ResourceTrend,
  gpu_utilization: GPUUtilization,
  gpu_usage_trend: GPUUsageTrend,
  cluster_resource_tree: ClusterResourceTree,
  // Dashboard-specific cards
  storage_overview: StorageOverview,
  pvc_status: PVCStatus,
  network_overview: NetworkOverview,
  service_status: ServiceStatus,
  compute_overview: ComputeOverview,
  // Cluster-scoped cards
  cluster_focus: ClusterFocus,
  cluster_comparison: ClusterComparison,
  cluster_costs: ClusterCosts,
  cluster_network: ClusterNetwork,
  // Namespace-scoped cards
  namespace_overview: NamespaceOverview,
  namespace_quotas: NamespaceQuotas,
  namespace_rbac: NamespaceRBAC,
  namespace_events: NamespaceEvents,
  // Operator-scoped cards
  operator_status: OperatorStatus,
  operator_subscriptions: OperatorSubscriptions,
  crd_health: CRDHealth,
  // Helm-scoped cards
  helm_release_status: HelmReleaseStatus,
  helm_values_diff: HelmValuesDiff,
  helm_history: HelmHistory,
  chart_versions: ChartVersions,
  // Kustomize-scoped cards
  kustomization_status: KustomizationStatus,
  overlay_comparison: OverlayComparison,
  // ArgoCD cards
  argocd_applications: ArgoCDApplications,
  argocd_sync_status: ArgoCDSyncStatus,
  argocd_health: ArgoCDHealth,
  // User management
  user_management: UserManagement,
  // Klaude AI mission cards
  klaude_issues: KlaudeIssuesCard,
  klaude_kubeconfig_audit: KlaudeKubeconfigAuditCard,
  klaude_health_check: KlaudeHealthCheckCard,
  // Alerting cards
  active_alerts: ActiveAlerts,
  alert_rules: AlertRulesCard,
  // Cost management integrations
  opencost_overview: OpenCostOverview,
  kubecost_overview: KubecostOverview,
  // Policy management cards
  opa_policies: OPAPolicies,
  kyverno_policies: KyvernoPolicies,

  // Aliases - map catalog types to existing components with similar functionality
  gpu_list: GPUInventory,
  gpu_issues: GPUStatus,
  memory_usage: ResourceUsage,
  memory_trend: ClusterMetrics,
  cpu_usage: ResourceUsage,
  cpu_trend: ClusterMetrics,
  top_cpu_pods: TopPods,
  pod_status: AppStatus,
  pod_list: TopPods,
  error_count: PodIssues,
}

/**
 * Cards that use demo/mock data instead of real data.
 * Used to show a demo banner when these cards are present.
 */
export const DEMO_DATA_CARDS = new Set([
  // ArgoCD cards - all use mock data
  'argocd_applications',
  'argocd_health',
  'argocd_sync_status',
  // GitOps cards - use mock data
  'kustomization_status',
  'overlay_comparison',
  // Helm cards - all now use real data via helm CLI backend
  // Namespace cards - namespace_quotas, namespace_rbac, resource_capacity, and helm_release_status now have real data support
  // Cost management integrations - demo until connected
  'opencost_overview',
  'kubecost_overview',
  // Policy management - kyverno is demo-only
  'kyverno_policies',
])

/**
 * Get a card component by type.
 * Returns undefined if the card type is not registered.
 */
export function getCardComponent(cardType: string): CardComponent | undefined {
  return CARD_COMPONENTS[cardType]
}

/**
 * Check if a card type is registered.
 */
export function isCardTypeRegistered(cardType: string): boolean {
  return cardType in CARD_COMPONENTS
}

/**
 * Get all registered card types.
 */
export function getRegisteredCardTypes(): string[] {
  return Object.keys(CARD_COMPONENTS)
}
