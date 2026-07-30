import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const hipaaDashboardConfig: UnifiedDashboardConfig = {
  id: 'hipaa',
  name: 'HIPAA Compliance',
  subtitle: 'Security Rule technical safeguards for PHI workloads',
  route: '/hipaa',
  statsType: 'security',
  cards: [
    { id: 'hipaa-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'hipaa-workload-monitor', cardType: 'workload_monitor', title: 'Workload Monitor', position: { w: 4, h: 3 } },
    { id: 'hipaa-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'hipaa-dashboard-cards-v2',
}

export default hipaaDashboardConfig
