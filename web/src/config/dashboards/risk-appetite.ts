import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskAppetiteDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-appetite',
  name: 'Risk Appetite',
  subtitle: 'Risk tolerance monitoring and KRI tracking',
  route: '/enterprise/risk-appetite',
  statsType: 'security',
  cards: [
    { id: 'ra-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'ra-resource-capacity', cardType: 'resource_capacity', title: 'Resource Capacity', position: { w: 4, h: 3 } },
    { id: 'ra-cluster-metrics', cardType: 'cluster_metrics', title: 'Cluster Metrics', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-appetite-dashboard-cards-v2',
}

export default riskAppetiteDashboardConfig
