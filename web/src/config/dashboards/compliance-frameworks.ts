/**
 * Compliance Frameworks Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceFrameworksDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance-frameworks',
  name: 'Compliance Frameworks',
  subtitle: 'Named regulatory compliance framework evaluation',
  route: '/compliance-frameworks',
  statsType: 'security',
  cards: [
    { id: 'cf-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'cf-fleet-compliance-heatmap', cardType: 'fleet_compliance_heatmap', title: 'Fleet Compliance Heatmap', position: { w: 4, h: 3 } },
    { id: 'cf-kyverno-policies', cardType: 'kyverno_policies', title: 'Kyverno Policies', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'compliance-frameworks-dashboard-cards-v2',
}

export default complianceFrameworksDashboardConfig
