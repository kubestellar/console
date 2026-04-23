import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const rbacAuditDashboardConfig: UnifiedDashboardConfig = {
  id: 'rbac-audit',
  name: 'RBAC Audit',
  subtitle: 'RBAC audit and least-privilege analysis',
  route: '/rbac-audit',
  statsType: 'security',
  cards: [
    { id: 'rbac-audit-1', cardType: 'rbac_audit', title: 'RBAC Audit', position: { w: 12, h: 4 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'rbac-audit-dashboard-cards',
}

export default rbacAuditDashboardConfig
