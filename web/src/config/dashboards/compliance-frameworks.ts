/**
 * Compliance Frameworks Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceFrameworksDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance-frameworks',
  name: 'Compliance Frameworks',
  subtitle: 'Named regulatory compliance framework evaluation',
  route: '/compliance-frameworks',
  statsType: 'compliance-frameworks',
  cards: [
    { id: 'framework-score-1', cardType: 'compliance_score', title: 'Framework Score', position: { w: 4, h: 3 } },
    { id: 'framework-controls-1', cardType: 'compliance_score', title: 'Controls Passed', position: { w: 4, h: 3 } },
    { id: 'framework-checks-1', cardType: 'compliance_score', title: 'Checks Summary', position: { w: 4, h: 3 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 120_000,
  },
  storageKey: 'compliance-frameworks-dashboard-cards',
}

export default complianceFrameworksDashboardConfig
