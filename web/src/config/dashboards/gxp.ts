import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const gxpDashboardConfig: UnifiedDashboardConfig = {
  id: 'gxp',
  name: 'GxP Validation',
  subtitle: '21 CFR Part 11 electronic records and signatures',
  route: '/gxp',
  statsType: 'security',
  cards: [
    { id: 'gxp-mode-1', cardType: 'compliance_score', title: 'GxP Mode', position: { w: 3, h: 3 } },
    { id: 'gxp-chain-1', cardType: 'compliance_score', title: 'Chain Integrity', position: { w: 3, h: 3 } },
    { id: 'gxp-records-1', cardType: 'compliance_score', title: 'Audit Records', position: { w: 3, h: 3 } },
    { id: 'gxp-sigs-1', cardType: 'compliance_score', title: 'Signatures', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'gxp-dashboard-cards',
}

export default gxpDashboardConfig
