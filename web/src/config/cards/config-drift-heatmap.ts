import type { UnifiedCardConfig } from '../../lib/unified/types'

export const configDriftHeatmapConfig: UnifiedCardConfig = {
  type: 'config_drift_heatmap',
  title: 'Config Drift Heatmap',
  category: 'insights',
  description: 'Cluster-pair matrix showing degree of configuration drift',
  icon: 'Diff',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Diff',
    title: 'No config drift detected',
    message: 'Shared workloads have consistent configuration',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
