import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const gxpDashboardConfig: UnifiedDashboardConfig = {
  id: 'gxp',
  name: 'GxP Validation',
  subtitle: '21 CFR Part 11 electronic records and signatures',
  route: '/gxp',
  statsType: 'security',
  cards: [
    { id: 'gxp-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'gxp-workload-monitor', cardType: 'workload_monitor', title: 'Workload Monitor', position: { w: 4, h: 3 } },
    { id: 'gxp-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'gxp-dashboard-cards-v2',
}

export default gxpDashboardConfig
