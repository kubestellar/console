import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const oidcDashboardConfig: UnifiedDashboardConfig = {
  id: 'oidc',
  name: 'OIDC Federation',
  subtitle: 'Identity provider federation and session management',
  route: '/oidc',
  statsType: 'security',
  cards: [
    { id: 'oidc-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'oidc-service-account-status', cardType: 'service_account_status', title: 'Service Account Status', position: { w: 4, h: 3 } },
    { id: 'oidc-role-binding-status', cardType: 'role_binding_status', title: 'Role Binding Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'oidc-dashboard-cards-v2',
}

export default oidcDashboardConfig
