import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const stigDashboardConfig: UnifiedDashboardConfig = {
  id: 'disa-stig',
  name: 'DISA STIG',
  subtitle: 'Security Technical Implementation Guides for hardened Kubernetes clusters',
  route: '/stig',
  statsType: 'security',
  cards: [
    { id: 'stig-cluster-health', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
    { id: 'stig-kubescape-scan', cardType: 'kubescape_scan', title: 'Kubescape Scan', position: { w: 4, h: 3 } },
    { id: 'stig-security-issues', cardType: 'security_issues', title: 'Security Issues', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 60_000 },
  storageKey: 'stig-dashboard-cards-v2',
}

export default stigDashboardConfig
