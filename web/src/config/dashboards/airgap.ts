import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const airgapDashboardConfig: UnifiedDashboardConfig = {
  id: 'airgap-readiness',
  name: 'Air-Gap Readiness',
  subtitle: 'Disconnected environment readiness assessment for Kubernetes clusters',
  route: '/air-gap',
  statsType: 'security',
  cards: [
    { id: 'airgap-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'airgap-network-policy-status', cardType: 'network_policy_status', title: 'Network Policy Status', position: { w: 4, h: 3 } },
    { id: 'airgap-node-status', cardType: 'node_status', title: 'Node Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'airgap-dashboard-cards-v2',
}

export default airgapDashboardConfig
