import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const changeControlDashboardConfig: UnifiedDashboardConfig = {
  id: 'change-control',
  name: 'Change Control',
  subtitle: 'SOX/PCI-compliant change control audit trail',
  route: '/change-control',
  statsType: 'security',
  cards: [
    { id: 'cc-summary-1', cardType: 'compliance_score', title: 'Change Summary', position: { w: 4, h: 3 } },
    { id: 'cc-risk-1', cardType: 'compliance_score', title: 'Risk Score', position: { w: 4, h: 3 } },
    { id: 'cc-violations-1', cardType: 'compliance_score', title: 'Policy Violations', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'change-control-dashboard-cards',
}

export default changeControlDashboardConfig
