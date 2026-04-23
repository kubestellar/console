import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sessionManagementDashboardConfig: UnifiedDashboardConfig = {
  id: 'session-management',
  name: 'Session Management',
  subtitle: 'Enterprise session monitoring and policy enforcement',
  route: '/sessions',
  statsType: 'security',
  cards: [
    { id: 'session-main', cardType: 'session_dashboard', title: 'Session Management Overview', position: { w: 12, h: 8 } },
    { id: 'session-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'session-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'session-compliance', cardType: 'session_management', title: 'Session Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'session-management-dashboard-cards',
}

export default sessionManagementDashboardConfig
