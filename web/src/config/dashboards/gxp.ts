import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const gxpDashboardConfig: UnifiedDashboardConfig = {
  id: 'gxp',
  name: 'GxP Validation',
  subtitle: '21 CFR Part 11 electronic records and signatures',
  route: '/gxp',
  statsType: 'security',
  cards: [
    { id: 'gxp-main', cardType: 'gxp_dashboard', title: 'GxP Validation Overview', position: { w: 12, h: 8 } },
    { id: 'gxp-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'gxp-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'gxp-compliance', cardType: 'gxp_validation', title: 'GxP Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'gxp-dashboard-cards',
}

export default gxpDashboardConfig
