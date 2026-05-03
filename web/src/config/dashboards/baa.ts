import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const baaDashboardConfig: UnifiedDashboardConfig = {
  id: 'baa',
  name: 'BAA Tracker',
  subtitle: 'Business Associate Agreement management for HIPAA',
  route: '/baa',
  statsType: 'security',
  cards: [
    { id: 'baa-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'baa-workload-monitor', cardType: 'workload_monitor', title: 'Workload Monitor', position: { w: 4, h: 3 } },
    { id: 'baa-policy-violations', cardType: 'policy_violations', title: 'Policy Violations', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'baa-dashboard-cards-v2',
}

export default baaDashboardConfig
