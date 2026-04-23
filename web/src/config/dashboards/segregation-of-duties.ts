import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const sodDashboardConfig: UnifiedDashboardConfig = {
  id: 'segregation-of-duties',
  name: 'Segregation of Duties',
  subtitle: 'RBAC conflict detection for SOX/PCI compliance',
  route: '/segregation-of-duties',
  statsType: 'security',
  cards: [
    { id: 'sod-score-1', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 3 } },
    { id: 'sod-violations-1', cardType: 'compliance_score', title: 'Violations', position: { w: 4, h: 3 } },
    { id: 'sod-principals-1', cardType: 'compliance_score', title: 'Principals', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'sod-dashboard-cards',
}

export default sodDashboardConfig
