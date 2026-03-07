import type { UnifiedCardConfig } from '../../lib/unified/types'

export const crossClusterEventCorrelationConfig: UnifiedCardConfig = {
  type: 'cross_cluster_event_correlation',
  title: 'Cross-Cluster Event Correlation',
  category: 'insights',
  description: 'Unified timeline showing correlated warning events across multiple clusters',
  icon: 'Activity',
  iconColor: 'text-red-400',
  defaultWidth: 12,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Activity',
    title: 'No cross-cluster event correlations detected',
    message: 'Warning events are isolated to individual clusters',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
