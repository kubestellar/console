import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const fedrampDashboardConfig: UnifiedDashboardConfig = {
  id: 'fedramp',
  name: 'FedRAMP',
  subtitle: 'Federal Risk and Authorization Management Program compliance assessment',
  route: '/fedramp',
  statsType: 'security',
  cards: [
    { id: 'fedramp-score-1', cardType: 'fedramp_readiness', title: 'FedRAMP Score', position: { w: 3, h: 3 } },
    { id: 'fedramp-controls-1', cardType: 'fedramp_readiness', title: 'Controls', position: { w: 3, h: 3 } },
    { id: 'fedramp-poams-1', cardType: 'fedramp_readiness', title: 'POAMs', position: { w: 3, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'fedramp-dashboard-cards',
}

export default fedrampDashboardConfig
