/**
 * Compliance Reports Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceReportsDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance-reports',
  name: 'Compliance Reports',
  subtitle: 'Generate and download compliance audit reports',
  route: '/compliance-reports',
  statsType: 'security',
  cards: [
    { id: 'cr-main', cardType: 'compliance_reports_dashboard', title: 'Compliance Reports Overview', position: { w: 12, h: 8 } },
    { id: 'cr-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'cr-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'cr-compliance', cardType: 'compliance_reports', title: 'Reports Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'compliance-reports-dashboard-cards',
}

export default complianceReportsDashboardConfig
