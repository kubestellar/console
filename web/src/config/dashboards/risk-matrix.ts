import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskMatrixDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-matrix',
  name: 'Risk Matrix',
  subtitle: 'Interactive risk heat map and assessment',
  route: '/enterprise/risk-matrix',
  statsType: 'security',
  cards: [
    { id: 'rm-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'rm-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'rm-risk-matrix', cardType: 'risk_matrix', title: 'Risk Matrix Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-matrix-dashboard-cards',
}

export default riskMatrixDashboardConfig
