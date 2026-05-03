import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskMatrixDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-matrix',
  name: 'Risk Matrix',
  subtitle: 'Interactive risk heat map and assessment',
  route: '/enterprise/risk-matrix',
  statsType: 'security',
  cards: [
    { id: 'rm-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'rm-fleet-compliance-heatmap', cardType: 'fleet_compliance_heatmap', title: 'Fleet Compliance Heatmap', position: { w: 4, h: 3 } },
    { id: 'rm-active-alerts', cardType: 'active_alerts', title: 'Active Alerts', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-matrix-dashboard-cards-v2',
}

export default riskMatrixDashboardConfig
