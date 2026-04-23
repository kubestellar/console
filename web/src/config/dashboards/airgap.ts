import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const airgapDashboardConfig: UnifiedDashboardConfig = {
  id: 'airgap-readiness',
  name: 'Air-Gap Readiness',
  subtitle: 'Disconnected environment readiness assessment for Kubernetes clusters',
  route: '/air-gap',
  statsType: 'security',
  cards: [
    { id: 'airgap-main', cardType: 'airgap_dashboard', title: 'Air-Gap Readiness Overview', position: { w: 12, h: 8 } },
    { id: 'airgap-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'airgap-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'airgap-compliance', cardType: 'air_gap_readiness', title: 'Air-Gap Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'airgap-dashboard-cards',
}

export default airgapDashboardConfig
