/**
 * Data Residency Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const dataResidencyDashboardConfig: UnifiedDashboardConfig = {
  id: 'data-residency',
  name: 'Data Residency',
  subtitle: 'Geographic data sovereignty enforcement across clusters',
  route: '/data-residency',
  statsType: 'security',
  cards: [
    { id: 'residency-summary-1', cardType: 'compliance_score', title: 'Residency Posture', position: { w: 4, h: 3 } },
    { id: 'residency-map-1', cardType: 'compliance_score', title: 'Cluster Regions', position: { w: 4, h: 3 } },
    { id: 'residency-violations-1', cardType: 'compliance_score', title: 'Violations', position: { w: 4, h: 3 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 120_000,
  },
  storageKey: 'data-residency-dashboard-cards',
}

export default dataResidencyDashboardConfig
