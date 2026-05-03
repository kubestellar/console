/**
 * Data Residency Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const dataResidencyDashboardConfig: UnifiedDashboardConfig = {
  id: 'data-residency',
  name: 'Data Residency',
  subtitle: 'Geographic data sovereignty enforcement across clusters',
  route: '/data-residency',
  statsType: 'security',
  cards: [
    { id: 'dr-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'dr-namespace-overview', cardType: 'namespace_overview', title: 'Namespace Overview', position: { w: 4, h: 3 } },
    { id: 'dr-network-policy-status', cardType: 'network_policy_status', title: 'Network Policy Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'data-residency-dashboard-cards-v2',
}

export default dataResidencyDashboardConfig
