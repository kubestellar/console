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
    { id: 'drasi-pipeline-health-1', cardType: 'drasi_pipeline_health', title: 'Pipeline Health', position: { w: 6, h: 6 } },
    { id: 'drasi-pipelines-1', cardType: 'drasi_pipelines', title: 'Pipeline Status', position: { w: 6, h: 6 } },
    { id: 'drasi-reactive-graph-1', cardType: 'drasi_reactive_graph', title: 'Drasi Reactive Graph', position: { w: 12, h: 8 } },
    { id: 'drasi-topology-1', cardType: 'drasi_topology', title: 'Source → Query → Reaction Topology', position: { w: 12, h: 6 } },
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
