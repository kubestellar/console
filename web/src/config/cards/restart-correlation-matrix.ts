import type { UnifiedCardConfig } from '../../lib/unified/types'

export const restartCorrelationMatrixConfig: UnifiedCardConfig = {
  type: 'restart_correlation_matrix',
  title: 'Restart Correlation Matrix',
  category: 'insights',
  description: 'Detects horizontal (app bug) vs vertical (infra issue) restart patterns',
  icon: 'RefreshCcw',
  iconColor: 'text-yellow-400',
  defaultWidth: 8,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'RefreshCcw',
    title: 'No restart correlations detected',
    message: 'Pod restarts are within normal patterns',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
