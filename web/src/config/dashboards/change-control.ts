import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const changeControlDashboardConfig: UnifiedDashboardConfig = {
  id: 'change-control',
  name: 'Change Control',
  subtitle: 'SOX/PCI-compliant change control audit trail',
  route: '/change-control',
  statsType: 'security',
  cards: [
    { id: 'cc-main', cardType: 'change_control_dashboard', title: 'Change Control Overview', position: { w: 12, h: 8 } },
    { id: 'cc-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'cc-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'cc-compliance', cardType: 'change_control', title: 'Change Control Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'change-control-dashboard-cards',
}

export default changeControlDashboardConfig
