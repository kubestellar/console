import type { UnifiedCardConfig } from '../../lib/unified/types'

export const rightSizeAdvisorConfig: UnifiedCardConfig = {
  type: 'right_size_advisor',
  title: 'Right-Size Advisor',
  category: 'cost',
  description: 'Per-cluster sizing verdicts with actionable recommendations to right-size, scale down, or add headroom',
  icon: 'Scale',
  iconColor: 'text-emerald-400',
  defaultWidth: 8,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useClusters' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Scale',
    title: 'No clusters available',
    message: 'Connect clusters to see right-sizing recommendations',
    variant: 'info',
  },
  loadingState: { type: 'list' },
  isDemoData: false,
  isLive: true,
}

export default rightSizeAdvisorConfig
