import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const nistDashboardConfig: UnifiedDashboardConfig = {
  id: 'nist-800-53',
  name: 'NIST 800-53',
  subtitle: 'Federal information security controls mapped to Kubernetes infrastructure',
  route: '/nist-800-53',
  statsType: 'security',
  cards: [
    { id: 'nist-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'nist-fleet-compliance-heatmap', cardType: 'fleet_compliance_heatmap', title: 'Fleet Compliance Heatmap', position: { w: 4, h: 3 } },
    { id: 'nist-trestle-scan', cardType: 'trestle_scan', title: 'Trestle Scan', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'nist-dashboard-cards-v2',
}

export default nistDashboardConfig
