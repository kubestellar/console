import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const fedrampDashboardConfig: UnifiedDashboardConfig = {
  id: 'fedramp',
  name: 'FedRAMP',
  subtitle: 'Federal Risk and Authorization Management Program compliance assessment',
  route: '/fedramp',
  statsType: 'security',
  cards: [
    { id: 'fedramp-main', cardType: 'fedramp_dashboard', title: 'FedRAMP Overview', position: { w: 12, h: 8 } },
    { id: 'fedramp-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'fedramp-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'fedramp-compliance', cardType: 'fedramp_readiness', title: 'FedRAMP Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'fedramp-dashboard-cards',
}

export default fedrampDashboardConfig
