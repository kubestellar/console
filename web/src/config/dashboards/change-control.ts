import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const changeControlDashboardConfig: UnifiedDashboardConfig = {
  id: 'change-control',
  name: 'Change Control',
  subtitle: 'SOX/PCI-compliant change control audit trail',
  route: '/change-control',
  statsType: 'security',
  cards: [
    { id: 'cc-compliance-drift', cardType: 'compliance_drift', title: 'Compliance Drift', position: { w: 4, h: 3 } },
    { id: 'cc-warning-events', cardType: 'warning_events', title: 'Warning Events', position: { w: 4, h: 3 } },
    { id: 'cc-deployment-status', cardType: 'deployment_status', title: 'Deployment Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'change-control-dashboard-cards-v2',
}

export default changeControlDashboardConfig
