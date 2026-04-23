/**
 * Compliance Frameworks Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceFrameworksDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance-frameworks',
  name: 'Compliance Frameworks',
  subtitle: 'Named regulatory compliance framework evaluation',
  route: '/compliance-frameworks',
  statsType: 'security',
  cards: [
    { id: 'cf-main', cardType: 'compliance_frameworks_dashboard', title: 'Compliance Frameworks Overview', position: { w: 12, h: 8 } },
    { id: 'cf-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'cf-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'cf-compliance', cardType: 'compliance_frameworks', title: 'Frameworks Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'compliance-frameworks-dashboard-cards',
}

export default complianceFrameworksDashboardConfig
