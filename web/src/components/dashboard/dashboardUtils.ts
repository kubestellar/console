import { CARD_COMPONENTS } from '../cards/cardRegistry'

export interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
  last_summary?: string
  title?: string
}

export interface DashboardData {
  id: string
  name: string
  is_default?: boolean
  cards: Card[]
}

export function isLocalOnlyCard(cardId: string): boolean {
  return cardId.startsWith('new-') ||
         cardId.startsWith('template-') ||
         cardId.startsWith('restored-') ||
         cardId.startsWith('ai-') ||
         cardId.startsWith('rec-') ||
         cardId.startsWith('demo-')
}

export function mapVisualizationToCardType(visualization: string, type: string): string {
  if (type && CARD_COMPONENTS[type]) {
    return type
  }

  const mapping: Record<string, string> = {
    gauge: 'resource_usage',
    timeseries: 'cluster_metrics',
    events: 'event_stream',
    donut: 'app_status',
    bar: 'cluster_metrics',
    status: 'cluster_health',
    table: 'pod_issues',
    sparkline: 'cluster_metrics',
  }
  return mapping[visualization] || type
}

export function getDefaultCardSize(cardType: string): { w: number; h: number } {
  const cardSizes: Record<string, { w: number; h: number }> = {
    cluster_resource_tree: { w: 12, h: 6 },
    pvc_status: { w: 8, h: 3 },
    service_status: { w: 8, h: 3 },
    security_issues: { w: 8, h: 4 },
    deployment_issues: { w: 8, h: 3 },
    user_management: { w: 8, h: 4 },
    operator_subscriptions: { w: 8, h: 3 },
    helm_values_diff: { w: 8, h: 4 },
    chart_versions: { w: 8, h: 3 },
    namespace_rbac: { w: 8, h: 4 },
    alert_rules: { w: 8, h: 4 },
    pod_issues: { w: 8, h: 3 },
    top_pods: { w: 8, h: 3 },
    cluster_metrics: { w: 6, h: 3 },
    events_timeline: { w: 6, h: 3 },
    pod_health_trend: { w: 6, h: 3 },
    resource_trend: { w: 6, h: 3 },
    gpu_usage_trend: { w: 6, h: 3 },
    gpu_utilization: { w: 6, h: 3 },
    event_stream: { w: 6, h: 4 },
    helm_history: { w: 6, h: 3 },
    namespace_events: { w: 6, h: 4 },
    gpu_inventory: { w: 6, h: 3 },
    gpu_workloads: { w: 6, h: 3 },
    deployment_status: { w: 6, h: 3 },
    app_status: { w: 6, h: 3 },
    kustomization_status: { w: 6, h: 3 },
    gitops_drift: { w: 6, h: 3 },
    cluster_comparison: { w: 6, h: 3 },
    cluster_costs: { w: 6, h: 3 },
    opencost_overview: { w: 6, h: 3 },
    kubecost_overview: { w: 6, h: 3 },
    overlay_comparison: { w: 6, h: 3 },
    argocd_applications: { w: 6, h: 3 },
    cluster_health: { w: 4, h: 3 },
    cluster_focus: { w: 4, h: 3 },
    resource_usage: { w: 4, h: 3 },
    resource_capacity: { w: 4, h: 3 },
    gpu_overview: { w: 4, h: 3 },
    gpu_status: { w: 4, h: 3 },
    storage_overview: { w: 4, h: 3 },
    network_overview: { w: 4, h: 3 },
    cluster_network: { w: 4, h: 3 },
    helm_release_status: { w: 4, h: 3 },
    operator_status: { w: 4, h: 3 },
    crd_health: { w: 4, h: 3 },
    namespace_overview: { w: 4, h: 3 },
    namespace_quotas: { w: 4, h: 3 },
    active_alerts: { w: 4, h: 3 },
    argocd_sync_status: { w: 4, h: 3 },
    argocd_health: { w: 4, h: 3 },
    opa_policies: { w: 4, h: 3 },
    kyverno_policies: { w: 4, h: 3 },
    deployment_progress: { w: 4, h: 3 },
    upgrade_status: { w: 4, h: 3 },
    compute_overview: { w: 4, h: 3 },
    klaude_issues: { w: 4, h: 4 },
    klaude_kubeconfig_audit: { w: 4, h: 3 },
    klaude_health_check: { w: 4, h: 3 },
  }
  return cardSizes[cardType] || { w: 4, h: 3 }
}

export function getDemoCards(): Card[] {
  return [
    { id: 'demo-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } },
    { id: 'demo-2', card_type: 'resource_usage', config: {}, position: { x: 4, y: 0, w: 4, h: 2 } },
    { id: 'demo-3', card_type: 'event_stream', config: {}, position: { x: 8, y: 0, w: 4, h: 2 } },
    { id: 'demo-4', card_type: 'cluster_metrics', config: {}, position: { x: 0, y: 2, w: 6, h: 2 } },
    { id: 'demo-5', card_type: 'deployment_status', config: {}, position: { x: 6, y: 2, w: 6, h: 2 } },
    { id: 'demo-6', card_type: 'pod_issues', config: {}, position: { x: 0, y: 4, w: 4, h: 2 } },
    { id: 'demo-7', card_type: 'app_status', config: {}, position: { x: 4, y: 4, w: 4, h: 2 } },
  ]
}
