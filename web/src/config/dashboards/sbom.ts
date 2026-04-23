import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sbomDashboardConfig: UnifiedDashboardConfig = {
  id: 'sbom',
  name: 'SBOM Manager',
  subtitle: 'Software bill of materials, vulnerability tracking, and license compliance',
  route: '/enterprise/sbom',
  statsType: 'security',
  cards: [
    { id: 'sbom-cluster', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'sbom-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'sbom-summary', cardType: 'sbom_manager', title: 'SBOM Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sbom-dashboard-cards',
}

export default sbomDashboardConfig
