import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const slsaDashboardConfig: UnifiedDashboardConfig = {
  id: 'slsa',
  name: 'SLSA Provenance',
  subtitle: 'Build provenance levels, attestation verification, and source integrity',
  route: '/enterprise/slsa',
  statsType: 'security',
  cards: [
    { id: 'slsa-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'slsa-compliance-score', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'slsa-deployment-status', cardType: 'deployment_status', title: 'Deployment Status', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'slsa-dashboard-cards-v2',
}

export default slsaDashboardConfig
