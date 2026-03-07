import type { UnifiedCardConfig } from '../../lib/unified/types'

export const clusterDeltaDetectorConfig: UnifiedCardConfig = {
  type: 'cluster_delta_detector',
  title: 'Cluster Delta Detector',
  category: 'insights',
  description: 'Detects differences between clusters sharing the same workloads',
  icon: 'GitCompare',
  iconColor: 'text-blue-400',
  defaultWidth: 8,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'GitCompare',
    title: 'No cluster deltas detected',
    message: 'Shared workloads are consistent across clusters',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
