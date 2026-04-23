import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const stigDashboardConfig: UnifiedDashboardConfig = {
  id: 'disa-stig',
  name: 'DISA STIG',
  subtitle: 'Security Technical Implementation Guides for hardened Kubernetes clusters',
  route: '/stig',
  statsType: 'security',
  cards: [
    { id: 'stig-score-1', cardType: 'stig_compliance', title: 'Compliance Score', position: { w: 3, h: 3 } },
    { id: 'stig-findings-1', cardType: 'stig_compliance', title: 'Open Findings', position: { w: 3, h: 3 } },
    { id: 'stig-benchmarks-1', cardType: 'stig_compliance', title: 'Benchmarks', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'stig-dashboard-cards',
}

export default stigDashboardConfig
