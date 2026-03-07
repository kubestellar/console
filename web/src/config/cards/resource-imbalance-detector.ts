import type { UnifiedCardConfig } from '../../lib/unified/types'

export const resourceImbalanceDetectorConfig: UnifiedCardConfig = {
  type: 'resource_imbalance_detector',
  title: 'Resource Imbalance Detector',
  category: 'insights',
  description: 'Detects CPU/memory utilization skew across the fleet',
  icon: 'Scale',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Scale',
    title: 'No resource imbalance detected',
    message: 'Cluster resource utilization is balanced',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
