import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const nistDashboardConfig: UnifiedDashboardConfig = {
  id: 'nist-800-53',
  name: 'NIST 800-53',
  subtitle: 'Federal information security controls mapped to Kubernetes infrastructure',
  route: '/nist-800-53',
  statsType: 'security',
  cards: [
    { id: 'nist-score-1', cardType: 'nist_800_53', title: 'Compliance Score', position: { w: 3, h: 3 } },
    { id: 'nist-families-1', cardType: 'nist_800_53', title: 'Control Families', position: { w: 3, h: 3 } },
    { id: 'nist-mappings-1', cardType: 'nist_800_53', title: 'Resource Mappings', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'nist-dashboard-cards',
}

export default nistDashboardConfig
