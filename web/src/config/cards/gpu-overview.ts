/**
 * GPU Overview Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const gpuOverviewConfig: UnifiedCardConfig = {
  type: 'gpu_overview',
  title: 'GPU Overview',
  category: 'compute',
  description: 'GPU resource summary',
  icon: 'Cpu',
  iconColor: 'text-green-400',
  defaultWidth: 4,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useGPUNodes' },
  content: {
    type: 'custom',
  },
  emptyState: { icon: 'Cpu', title: 'No GPUs', message: 'No GPU data available', variant: 'info' },
  loadingState: { type: 'stats', count: 4 },
  isDemoData: false,
  isLive: true,
}
export default gpuOverviewConfig
