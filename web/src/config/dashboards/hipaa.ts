import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const hipaaDashboardConfig: UnifiedDashboardConfig = {
  id: 'hipaa',
  name: 'HIPAA Compliance',
  subtitle: 'Security Rule technical safeguards for PHI workloads',
  route: '/hipaa',
  statsType: 'security',
  cards: [
    { id: 'hipaa-main', cardType: 'hipaa_dashboard', title: 'HIPAA Compliance Overview', position: { w: 12, h: 8 } },
    { id: 'hipaa-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'hipaa-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'hipaa-compliance', cardType: 'hipaa_compliance', title: 'HIPAA Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'hipaa-dashboard-cards',
}

export default hipaaDashboardConfig
