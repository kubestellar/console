/**
 * Default card configurations for each dashboard type.
 * These are used when a user first visits a dashboard or resets to defaults.
 */

export interface DefaultCard {
  id: string
  card_type: string
  title?: string
  config: Record<string, unknown>
  position?: { w: number; h: number }
}

/**
 * Dashboard types that have customizable card layouts
 */
export type DashboardType =
  | 'clusters'
  | 'workloads'
  | 'gitops'
  | 'storage'
  | 'network'
  | 'security'
  | 'compliance'
  | 'compute'
  | 'events'
  | 'cost'

/**
 * Default cards for the Clusters dashboard
 */
export const DEFAULT_CLUSTERS_CARDS: DefaultCard[] = [
  { id: 'default-cluster-health', card_type: 'cluster_health', title: 'Cluster Health', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-cluster-comparison', card_type: 'cluster_comparison', title: 'Cluster Comparison', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-resource-capacity', card_type: 'resource_capacity', title: 'Resource Capacity', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-upgrade-status', card_type: 'upgrade_status', title: 'Cluster Upgrade Status', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-event-stream', card_type: 'event_stream', title: 'Event Stream', config: {}, position: { w: 4, h: 2 } },
]

/**
 * Default cards for the Workloads dashboard
 */
export const DEFAULT_WORKLOADS_CARDS: DefaultCard[] = [
  { id: 'default-app-status', card_type: 'app_status', title: 'Workload Status', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-deployment-status', card_type: 'deployment_status', title: 'Deployment Status', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-deployment-progress', card_type: 'deployment_progress', title: 'Deployment Progress', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-pod-issues', card_type: 'pod_issues', title: 'Pod Issues', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-deployment-issues', card_type: 'deployment_issues', title: 'Deployment Issues', config: {}, position: { w: 6, h: 2 } },
]

/**
 * Default cards for the GitOps dashboard
 */
export const DEFAULT_GITOPS_CARDS: DefaultCard[] = [
  { id: 'default-gitops-drift', card_type: 'gitops_drift', title: 'GitOps Drift', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-helm-release-status', card_type: 'helm_release_status', title: 'Helm Release Status', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-argocd-applications', card_type: 'argocd_applications', title: 'ArgoCD Applications', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-kustomization-status', card_type: 'kustomization_status', title: 'Kustomization Status', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-chart-versions', card_type: 'chart_versions', title: 'Helm Chart Versions', config: {}, position: { w: 4, h: 2 } },
]

/**
 * Default cards for the Storage dashboard
 */
export const DEFAULT_STORAGE_CARDS: DefaultCard[] = [
  { id: 'default-storage-overview', card_type: 'storage_overview', title: 'Storage Overview', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-pvc-status', card_type: 'pvc_status', title: 'PVC Status', config: {}, position: { w: 6, h: 2 } },
]

/**
 * Default cards for the Network dashboard
 */
export const DEFAULT_NETWORK_CARDS: DefaultCard[] = [
  { id: 'default-network-overview', card_type: 'network_overview', title: 'Network Overview', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-service-status', card_type: 'service_status', title: 'Service Status', config: {}, position: { w: 6, h: 2 } },
]

/**
 * Default cards for the Security dashboard
 */
export const DEFAULT_SECURITY_CARDS: DefaultCard[] = [
  { id: 'default-security-issues', card_type: 'security_issues', title: 'Security Issues', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-namespace-rbac', card_type: 'namespace_rbac', title: 'Namespace RBAC', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-user-management', card_type: 'user_management', title: 'User Management', config: {}, position: { w: 12, h: 2 } },
]

/**
 * Default cards for the Compliance dashboard
 */
export const DEFAULT_COMPLIANCE_CARDS: DefaultCard[] = [
  { id: 'default-opa-policies', card_type: 'opa_policies', title: 'OPA Policies', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-kyverno-policies', card_type: 'kyverno_policies', title: 'Kyverno Policies', config: {}, position: { w: 6, h: 2 } },
]

/**
 * Default cards for the Compute dashboard
 */
export const DEFAULT_COMPUTE_CARDS: DefaultCard[] = [
  { id: 'default-compute-overview', card_type: 'compute_overview', title: 'Compute Overview', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-gpu-overview', card_type: 'gpu_overview', title: 'GPU Overview', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-gpu-status', card_type: 'gpu_status', title: 'GPU Status', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-gpu-utilization', card_type: 'gpu_utilization', title: 'GPU Utilization', config: {}, position: { w: 4, h: 2 } },
  { id: 'default-top-pods', card_type: 'top_pods', title: 'Top Pods', config: {}, position: { w: 4, h: 2 } },
]

/**
 * Default cards for the Events dashboard
 */
export const DEFAULT_EVENTS_CARDS: DefaultCard[] = [
  { id: 'default-event-stream', card_type: 'event_stream', title: 'Event Stream', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-events-timeline', card_type: 'events_timeline', title: 'Events Timeline', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-namespace-events', card_type: 'namespace_events', title: 'Namespace Events', config: {}, position: { w: 12, h: 2 } },
]

/**
 * Default cards for the Cost dashboard
 */
export const DEFAULT_COST_CARDS: DefaultCard[] = [
  { id: 'default-cluster-costs', card_type: 'cluster_costs', title: 'Cluster Costs', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-kubecost-overview', card_type: 'kubecost_overview', title: 'Kubecost Overview', config: {}, position: { w: 6, h: 2 } },
  { id: 'default-opencost-overview', card_type: 'opencost_overview', title: 'OpenCost Overview', config: {}, position: { w: 12, h: 2 } },
]

/**
 * Get default cards for a specific dashboard type
 */
export function getDefaultCards(dashboardType: DashboardType): DefaultCard[] {
  switch (dashboardType) {
    case 'clusters':
      return DEFAULT_CLUSTERS_CARDS
    case 'workloads':
      return DEFAULT_WORKLOADS_CARDS
    case 'gitops':
      return DEFAULT_GITOPS_CARDS
    case 'storage':
      return DEFAULT_STORAGE_CARDS
    case 'network':
      return DEFAULT_NETWORK_CARDS
    case 'security':
      return DEFAULT_SECURITY_CARDS
    case 'compliance':
      return DEFAULT_COMPLIANCE_CARDS
    case 'compute':
      return DEFAULT_COMPUTE_CARDS
    case 'events':
      return DEFAULT_EVENTS_CARDS
    case 'cost':
      return DEFAULT_COST_CARDS
    default:
      return []
  }
}

/**
 * Storage key prefix for dashboard cards
 */
export function getDashboardStorageKey(dashboardType: DashboardType): string {
  return `kubestellar-${dashboardType}-cards`
}

/**
 * Load cards from localStorage, falling back to defaults
 */
export function loadDashboardCards(dashboardType: DashboardType): DefaultCard[] {
  const storageKey = getDashboardStorageKey(dashboardType)
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Fall through to return defaults
  }
  return getDefaultCards(dashboardType)
}

/**
 * Save cards to localStorage
 */
export function saveDashboardCards(dashboardType: DashboardType, cards: DefaultCard[]): void {
  const storageKey = getDashboardStorageKey(dashboardType)
  localStorage.setItem(storageKey, JSON.stringify(cards))
}

/**
 * Reset dashboard to default cards
 */
export function resetDashboardToDefaults(dashboardType: DashboardType): DefaultCard[] {
  const defaults = getDefaultCards(dashboardType)
  saveDashboardCards(dashboardType, defaults)
  return defaults
}

/**
 * Check if dashboard has been customized (differs from defaults)
 */
export function isDashboardCustomized(dashboardType: DashboardType): boolean {
  const storageKey = getDashboardStorageKey(dashboardType)
  return localStorage.getItem(storageKey) !== null
}
