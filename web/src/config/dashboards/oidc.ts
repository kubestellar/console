import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const oidcDashboardConfig: UnifiedDashboardConfig = {
  id: 'oidc',
  name: 'OIDC Federation',
  subtitle: 'Identity provider federation and session management',
  route: '/oidc',
  statsType: 'security',
  cards: [
    { id: 'oidc-1', cardType: 'oidc_federation', title: 'OIDC Federation', position: { w: 12, h: 4 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'oidc-dashboard-cards',
}

export default oidcDashboardConfig
