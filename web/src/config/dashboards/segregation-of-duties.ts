import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sodDashboardConfig: UnifiedDashboardConfig = {
  id: 'segregation-of-duties',
  name: 'Segregation of Duties',
  subtitle: 'RBAC conflict detection for SOX/PCI compliance',
  route: '/segregation-of-duties',
  statsType: 'security',
  cards: [
    { id: 'sod-role-binding-status', cardType: 'role_binding_status', title: 'Role Binding Status', position: { w: 4, h: 3 } },
    { id: 'sod-role-status', cardType: 'role_status', title: 'Role Status', position: { w: 4, h: 3 } },
    { id: 'sod-namespace-rbac', cardType: 'namespace_rbac', title: 'Namespace RBAC', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sod-dashboard-cards-v2',
}

export default sodDashboardConfig
