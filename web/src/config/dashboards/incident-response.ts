import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const incidentResponseDashboardConfig: UnifiedDashboardConfig = {
  id: 'incident-response',
  name: 'Incident Response',
  subtitle: 'Active incident tracking, playbook management, and MTTR metrics',
  route: '/enterprise/incident-response',
  statsType: 'security',
  cards: [
    { id: 'ir-incidents-1', cardType: 'incident_response', title: 'Active Incidents', position: { w: 4, h: 3 } },
    { id: 'ir-playbooks-1', cardType: 'incident_response', title: 'Playbooks', position: { w: 4, h: 3 } },
    { id: 'ir-metrics-1', cardType: 'incident_response', title: 'MTTR Metrics', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 30_000 },
  storageKey: 'incident-response-dashboard-cards',
}

export default incidentResponseDashboardConfig
