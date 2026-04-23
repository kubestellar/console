import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sessionManagementDashboardConfig: UnifiedDashboardConfig = {
  id: 'session-management',
  name: 'Session Management',
  subtitle: 'Enterprise session monitoring and policy enforcement',
  route: '/sessions',
  statsType: 'security',
  cards: [
    { id: 'session-mgmt-1', cardType: 'session_management', title: 'Session Management', position: { w: 12, h: 4 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'session-management-dashboard-cards',
}

export default sessionManagementDashboardConfig
