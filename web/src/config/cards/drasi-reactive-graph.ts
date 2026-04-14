/**
 * Drasi Reactive Graph Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const drasiReactiveGraphConfig: UnifiedCardConfig = {
  type: 'drasi_reactive_graph',
  title: 'Drasi Reactive Graph',
  category: 'drasi',
  description: 'Reactive data pipeline visualization — sources, continuous queries, reactions, and live results',
  icon: 'GitBranch',
  iconColor: 'text-emerald-400',
  defaultWidth: 12,
  defaultHeight: 8,
  dataSource: { type: 'hook', hook: 'useDrasiResources' },
  content: { type: 'custom' },
  emptyState: { icon: 'GitBranch', title: 'No Drasi Pipelines', message: 'No Drasi sources, queries, or reactions found', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default drasiReactiveGraphConfig
