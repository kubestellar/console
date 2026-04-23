import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const airgapDashboardConfig: UnifiedDashboardConfig = {
  id: 'airgap-readiness',
  name: 'Air-Gap Readiness',
  subtitle: 'Disconnected environment readiness assessment for Kubernetes clusters',
  route: '/air-gap',
  statsType: 'security',
  cards: [
    { id: 'airgap-score-1', cardType: 'air_gap_readiness', title: 'Overall Readiness', position: { w: 3, h: 3 } },
    { id: 'airgap-reqs-1', cardType: 'air_gap_readiness', title: 'Requirements', position: { w: 3, h: 3 } },
    { id: 'airgap-clusters-1', cardType: 'air_gap_readiness', title: 'Cluster Readiness', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'airgap-dashboard-cards',
}

export default airgapDashboardConfig
