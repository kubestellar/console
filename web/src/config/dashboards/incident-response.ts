import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const incidentResponseDashboardConfig: UnifiedDashboardConfig = {
  id: 'incident-response',
  name: 'Incident Response',
  subtitle: 'Active incident tracking, playbook management, and MTTR metrics',
  route: '/enterprise/incident-response',
  statsType: 'security',
  cards: [
    { id: 'ir-active-alerts', cardType: 'active_alerts', title: 'Active Alerts', position: { w: 4, h: 3 } },
    { id: 'ir-pod-issues', cardType: 'pod_issues', title: 'Pod Issues', position: { w: 4, h: 3 } },
    { id: 'ir-warning-events', cardType: 'warning_events', title: 'Warning Events', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 30_000 },
  storageKey: 'incident-response-dashboard-cards-v2',
}

export default incidentResponseDashboardConfig
