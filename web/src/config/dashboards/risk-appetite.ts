import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskAppetiteDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-appetite',
  name: 'Risk Appetite',
  subtitle: 'Risk tolerance monitoring and KRI tracking',
  route: '/enterprise/risk-appetite',
  statsType: 'security',
  cards: [
    { id: 'ra-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'ra-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'ra-risk-appetite', cardType: 'risk_appetite', title: 'Risk Appetite Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-appetite-dashboard-cards',
}

export default riskAppetiteDashboardConfig
