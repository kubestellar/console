import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const stigDashboardConfig: UnifiedDashboardConfig = {
  id: 'disa-stig',
  name: 'DISA STIG',
  subtitle: 'Security Technical Implementation Guides for hardened Kubernetes clusters',
  route: '/stig',
  statsType: 'security',
  cards: [
    { id: 'stig-main', cardType: 'stig_dashboard', title: 'DISA STIG Overview', position: { w: 12, h: 8 } },
    { id: 'stig-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'stig-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'stig-compliance', cardType: 'stig_compliance', title: 'STIG Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'stig-dashboard-cards',
}

export default stigDashboardConfig
