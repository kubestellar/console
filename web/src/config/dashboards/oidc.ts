import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const oidcDashboardConfig: UnifiedDashboardConfig = {
  id: 'oidc',
  name: 'OIDC Federation',
  subtitle: 'Identity provider federation and session management',
  route: '/oidc',
  statsType: 'security',
  cards: [
    { id: 'oidc-main', cardType: 'oidc_dashboard', title: 'OIDC Federation Overview', position: { w: 12, h: 8 } },
    { id: 'oidc-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'oidc-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'oidc-compliance', cardType: 'oidc_federation', title: 'OIDC Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'oidc-dashboard-cards',
}

export default oidcDashboardConfig
