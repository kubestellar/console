import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskRegisterDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-register',
  name: 'Risk Register',
  subtitle: 'Comprehensive risk tracking and management',
  route: '/enterprise/risk-register',
  statsType: 'security',
  cards: [
    { id: 'rr-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'rr-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'rr-risk-register', cardType: 'risk_register', title: 'Risk Register Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-register-dashboard-cards',
}

export default riskRegisterDashboardConfig
