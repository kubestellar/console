import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const nistDashboardConfig: UnifiedDashboardConfig = {
  id: 'nist-800-53',
  name: 'NIST 800-53',
  subtitle: 'Federal information security controls mapped to Kubernetes infrastructure',
  route: '/nist-800-53',
  statsType: 'security',
  cards: [
    { id: 'nist-main', cardType: 'nist_dashboard', title: 'NIST 800-53 Overview', position: { w: 12, h: 8 } },
    { id: 'nist-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'nist-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'nist-compliance', cardType: 'nist_800_53', title: 'NIST Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'nist-dashboard-cards',
}

export default nistDashboardConfig
