/**
 * Drasi Dashboard Configuration
 *
 * Reactive data pipelines — sources, continuous queries, and reactions.
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const drasiDashboardConfig: UnifiedDashboardConfig = {
  id: 'drasi',
  name: 'Drasi',
  subtitle: 'Reactive data pipelines and continuous queries',
  route: '/drasi',
  cards: [
    { id: 'drasi-reactive-graph-1', cardType: 'drasi_reactive_graph', title: 'Drasi Reactive Graph', position: { w: 12, h: 8 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'drasi-dashboard-cards',
}

export default drasiDashboardConfig
