import type { UnifiedCardConfig } from '../../lib/unified/types'

export const cascadeImpactMapConfig: UnifiedCardConfig = {
  type: 'cascade_impact_map',
  title: 'Cascade Impact Map',
  category: 'insights',
  description: 'Visualizes how issues cascade across clusters over time',
  icon: 'Workflow',
  iconColor: 'text-yellow-400',
  defaultWidth: 12,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useMultiClusterInsights' },
  content: { type: 'custom' },
  emptyState: {
    icon: 'Workflow',
    title: 'No cascade patterns detected',
    message: 'Issues are not propagating across clusters',
    variant: 'neutral',
  },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
