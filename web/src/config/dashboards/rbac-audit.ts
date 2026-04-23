import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const rbacAuditDashboardConfig: UnifiedDashboardConfig = {
  id: 'rbac-audit',
  name: 'RBAC Audit',
  subtitle: 'RBAC audit and least-privilege analysis',
  route: '/rbac-audit',
  statsType: 'security',
  cards: [
    { id: 'rbac-main', cardType: 'rbac_audit_dashboard', title: 'RBAC Audit Overview', position: { w: 12, h: 8 } },
    { id: 'rbac-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'rbac-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'rbac-compliance', cardType: 'rbac_audit', title: 'RBAC Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'rbac-audit-dashboard-cards',
}

export default rbacAuditDashboardConfig
