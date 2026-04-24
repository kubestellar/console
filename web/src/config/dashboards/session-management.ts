import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sessionManagementDashboardConfig: UnifiedDashboardConfig = {
  id: 'session-management',
  name: 'Session Management',
  subtitle: 'Enterprise session monitoring and policy enforcement',
  route: '/sessions',
  statsType: 'security',
  cards: [
    { id: 'session-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'session-active-alerts', cardType: 'active_alerts', title: 'Active Alerts', position: { w: 4, h: 3 } },
    { id: 'session-service-status', cardType: 'service_status', title: 'Service Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'session-management-dashboard-cards-v2',
}

export default sessionManagementDashboardConfig
