/**
 * Compliance Reports Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceReportsDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance-reports',
  name: 'Compliance Reports',
  subtitle: 'Generate and download compliance audit reports',
  route: '/compliance-reports',
  statsType: 'security',
  cards: [
    { id: 'cr-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'cr-trestle-scan', cardType: 'trestle_scan', title: 'Trestle Scan', position: { w: 4, h: 3 } },
    { id: 'cr-fleet-compliance-heatmap', cardType: 'fleet_compliance_heatmap', title: 'Fleet Compliance Heatmap', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'compliance-reports-dashboard-cards-v2',
}

export default complianceReportsDashboardConfig
