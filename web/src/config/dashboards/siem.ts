import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const siemDashboardConfig: UnifiedDashboardConfig = {
  id: 'siem',
  name: 'SIEM Integration',
  subtitle: 'Security event monitoring, log aggregation, and alert correlation',
  route: '/enterprise/siem',
  statsType: 'security',
  cards: [
    { id: 'siem-events-1', cardType: 'siem_integration', title: 'Event Timeline', position: { w: 4, h: 3 } },
    { id: 'siem-alerts-1', cardType: 'siem_integration', title: 'Alert Correlation', position: { w: 4, h: 3 } },
    { id: 'siem-summary-1', cardType: 'siem_integration', title: 'Severity Distribution', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'siem-dashboard-cards',
}

export default siemDashboardConfig
