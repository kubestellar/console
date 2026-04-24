import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sigstoreDashboardConfig: UnifiedDashboardConfig = {
  id: 'sigstore',
  name: 'Sigstore Verification',
  subtitle: 'Image signature verification, cosign results, and transparency log',
  route: '/enterprise/sigstore',
  statsType: 'security',
  cards: [
    { id: 'sigstore-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'sigstore-policy-violations', cardType: 'policy_violations', title: 'Policy Violations', position: { w: 4, h: 3 } },
    { id: 'sigstore-security-issues', cardType: 'security_issues', title: 'Security Issues', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'sigstore-dashboard-cards-v2',
}

export default sigstoreDashboardConfig
