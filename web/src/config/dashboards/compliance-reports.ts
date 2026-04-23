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
    { id: 'report-generator-1', cardType: 'compliance_score', title: 'Report Generator', position: { w: 6, h: 4 } },
    { id: 'report-frameworks-1', cardType: 'compliance_score', title: 'Available Frameworks', position: { w: 6, h: 4 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: false,
  },
  storageKey: 'compliance-reports-dashboard-cards',
}

export default complianceReportsDashboardConfig
