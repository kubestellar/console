import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const riskRegisterDashboardConfig: UnifiedDashboardConfig = {
  id: 'risk-register',
  name: 'Risk Register',
  subtitle: 'Comprehensive risk tracking and management',
  route: '/enterprise/risk-register',
  statsType: 'security',
  cards: [
    { id: 'rr-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'rr-warning-events', cardType: 'warning_events', title: 'Warning Events', position: { w: 4, h: 3 } },
    { id: 'rr-pod-issues', cardType: 'pod_issues', title: 'Pod Issues', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'risk-register-dashboard-cards-v2',
}

export default riskRegisterDashboardConfig
