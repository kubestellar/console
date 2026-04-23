import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sigstoreDashboardConfig: UnifiedDashboardConfig = {
  id: 'sigstore',
  name: 'Sigstore Verification',
  subtitle: 'Image signature verification, cosign results, and transparency log',
  route: '/enterprise/sigstore',
  statsType: 'security',
  cards: [
    { id: 'sigstore-cluster', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'sigstore-workloads', cardType: 'workload_status', title: 'Workload Status', position: { w: 4, h: 3 } },
    { id: 'sigstore-summary', cardType: 'sigstore_verify', title: 'Sigstore Summary', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sigstore-dashboard-cards',
}

export default sigstoreDashboardConfig
