/**
 * Insights Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const insightsDashboardConfig: UnifiedDashboardConfig = {
  id: 'insights',
  name: 'Insights',
  subtitle: 'Cross-cluster correlation and pattern detection',
  route: '/insights',
  statsType: 'insights',
  cards: [
    // Top row: Event Correlation (full width)
    { id: 'event-correlation-1', cardType: 'cross_cluster_event_correlation', title: 'Cross-Cluster Event Correlation', position: { w: 12, h: 4 } },
    // Second row: Resource Imbalance + Config Drift (half each)
    { id: 'resource-imbalance-1', cardType: 'resource_imbalance_detector', title: 'Resource Imbalance', position: { w: 6, h: 4 } },
    { id: 'config-drift-1', cardType: 'config_drift_heatmap', title: 'Config Drift Heatmap', position: { w: 6, h: 4 } },
    // Third row: Cluster Delta + Restart Correlation
    { id: 'cluster-delta-1', cardType: 'cluster_delta_detector', title: 'Cluster Delta Detector', position: { w: 8, h: 4 } },
    { id: 'restart-correlation-1', cardType: 'restart_correlation_matrix', title: 'Restart Correlation Matrix', position: { w: 4, h: 4 } },
    // Fourth row: Cascade Impact (full width)
    { id: 'cascade-impact-1', cardType: 'cascade_impact_map', title: 'Cascade Impact Map', position: { w: 12, h: 4 } },
    // Fifth row: Rollout Tracker
    { id: 'rollout-tracker-1', cardType: 'deployment_rollout_tracker', title: 'Deployment Rollout Tracker', position: { w: 8, h: 4 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'kubestellar-insights-cards',
}

export default insightsDashboardConfig
