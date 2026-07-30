import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sbomDashboardConfig: UnifiedDashboardConfig = {
  id: 'sbom',
  name: 'SBOM Manager',
  subtitle: 'Software bill of materials, vulnerability tracking, and license compliance',
  route: '/enterprise/sbom',
  statsType: 'security',
  cards: [
    { id: 'sbom-trivy-scan', cardType: 'trivy_scan', title: 'Trivy Scan', position: { w: 4, h: 3 } },
    { id: 'sbom-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'sbom-pod-health-trend', cardType: 'pod_health_trend', title: 'Pod Health Trend', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sbom-dashboard-cards-v2',
}

export default sbomDashboardConfig
