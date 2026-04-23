import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const slsaDashboardConfig: UnifiedDashboardConfig = {
  id: 'slsa',
  name: 'SLSA Provenance',
  subtitle: 'Build provenance levels, attestation verification, and source integrity',
  route: '/enterprise/slsa',
  statsType: 'security',
  cards: [
    { id: 'slsa-cluster', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'slsa-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'slsa-summary', cardType: 'slsa_provenance', title: 'SLSA Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'slsa-dashboard-cards',
}

export default slsaDashboardConfig
