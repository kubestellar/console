import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const rbacAuditDashboardConfig: UnifiedDashboardConfig = {
  id: 'rbac-audit',
  name: 'RBAC Audit',
  subtitle: 'RBAC audit and least-privilege analysis',
  route: '/rbac-audit',
  statsType: 'security',
  cards: [
    { id: 'rbac-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'rbac-role-binding-status', cardType: 'role_binding_status', title: 'Role Binding Status', position: { w: 4, h: 3 } },
    { id: 'rbac-namespace-rbac', cardType: 'namespace_rbac', title: 'Namespace RBAC', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'rbac-audit-dashboard-cards-v2',
}

export default rbacAuditDashboardConfig
