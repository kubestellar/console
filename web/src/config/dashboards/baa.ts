import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const baaDashboardConfig: UnifiedDashboardConfig = {
  id: 'baa',
  name: 'BAA Tracker',
  subtitle: 'Business Associate Agreement management for HIPAA',
  route: '/baa',
  statsType: 'security',
  cards: [
    { id: 'baa-main', cardType: 'baa_dashboard', title: 'BAA Tracker Overview', position: { w: 12, h: 8 } },
    { id: 'baa-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'baa-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'baa-compliance', cardType: 'baa_tracker', title: 'BAA Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'baa-dashboard-cards',
}

export default baaDashboardConfig
