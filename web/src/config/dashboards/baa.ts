import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const baaDashboardConfig: UnifiedDashboardConfig = {
  id: 'baa',
  name: 'BAA Tracker',
  subtitle: 'Business Associate Agreement management for HIPAA',
  route: '/baa',
  statsType: 'security',
  cards: [
    { id: 'baa-total-1', cardType: 'compliance_score', title: 'Total BAAs', position: { w: 3, h: 3 } },
    { id: 'baa-active-1', cardType: 'compliance_score', title: 'Active', position: { w: 3, h: 3 } },
    { id: 'baa-alerts-1', cardType: 'compliance_score', title: 'Alerts', position: { w: 3, h: 3 } },
    { id: 'baa-coverage-1', cardType: 'compliance_score', title: 'Coverage', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'baa-dashboard-cards',
}

export default baaDashboardConfig
