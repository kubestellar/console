import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const hipaaDashboardConfig: UnifiedDashboardConfig = {
  id: 'hipaa',
  name: 'HIPAA Compliance',
  subtitle: 'Security Rule technical safeguards for PHI workloads',
  route: '/hipaa',
  statsType: 'security',
  cards: [
    { id: 'hipaa-score-1', cardType: 'compliance_score', title: 'Compliance Score', position: { w: 3, h: 3 } },
    { id: 'hipaa-safeguards-1', cardType: 'compliance_score', title: 'Safeguards', position: { w: 3, h: 3 } },
    { id: 'hipaa-phi-1', cardType: 'compliance_score', title: 'PHI Namespaces', position: { w: 3, h: 3 } },
    { id: 'hipaa-flows-1', cardType: 'compliance_score', title: 'Data Flows', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'hipaa-dashboard-cards',
}

export default hipaaDashboardConfig
