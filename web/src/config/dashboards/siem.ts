import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const siemDashboardConfig: UnifiedDashboardConfig = {
  id: 'siem',
  name: 'SIEM Integration',
  subtitle: 'Security event monitoring, log aggregation, and alert correlation',
  route: '/enterprise/siem',
  statsType: 'security',
  cards: [
    { id: 'siem-event-stream', cardType: 'event_stream', title: 'Event Stream', position: { w: 4, h: 3 } },
    { id: 'siem-warning-events', cardType: 'warning_events', title: 'Warning Events', position: { w: 4, h: 3 } },
    { id: 'siem-active-alerts', cardType: 'active_alerts', title: 'Active Alerts', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'siem-dashboard-cards-v2',
}

export default siemDashboardConfig
