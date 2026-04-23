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
    { id: 'dr-main', cardType: 'data_residency_dashboard', title: 'Data Residency Overview', position: { w: 12, h: 8 } },
    { id: 'dr-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'dr-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'dr-compliance', cardType: 'data_residency', title: 'Residency Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'data-residency-dashboard-cards',
}

export default dataResidencyDashboardConfig
