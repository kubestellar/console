import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const fedrampDashboardConfig: UnifiedDashboardConfig = {
  id: 'fedramp',
  name: 'FedRAMP',
  subtitle: 'Federal Risk and Authorization Management Program compliance assessment',
  route: '/fedramp',
  statsType: 'security',
  cards: [
    { id: 'fedramp-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'fedramp-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'fedramp-trivy-scan', cardType: 'trivy_scan', title: 'Trivy Scan', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'fedramp-dashboard-cards-v2',
}

export default fedrampDashboardConfig
