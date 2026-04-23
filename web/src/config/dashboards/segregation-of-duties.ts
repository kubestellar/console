import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sodDashboardConfig: UnifiedDashboardConfig = {
  id: 'segregation-of-duties',
  name: 'Segregation of Duties',
  subtitle: 'RBAC conflict detection for SOX/PCI compliance',
  route: '/segregation-of-duties',
  statsType: 'security',
  cards: [
    { id: 'sod-main', cardType: 'segregation_of_duties_dashboard', title: 'Segregation of Duties Overview', position: { w: 12, h: 8 } },
    { id: 'sod-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'sod-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'sod-compliance', cardType: 'segregation_of_duties', title: 'SoD Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sod-dashboard-cards',
}

export default sodDashboardConfig
