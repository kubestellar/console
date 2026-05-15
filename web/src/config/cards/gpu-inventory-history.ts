/**
 * GPU Inventory History Card Configuration
 */
import { GREEN_500_BRIGHT, PURPLE_600 } from '../../lib/theme/chartColors'
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const gpuInventoryHistoryConfig: UnifiedCardConfig = {
  type: 'gpu_inventory_history',
  title: 'GPU Inventory History',
  category: 'live-trends',
  description: 'Historical GPU usage trends over time',
  icon: 'TrendingUp',
  iconColor: 'text-purple-400',
  defaultWidth: 8,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useMetricsHistory' },
  content: {
    type: 'chart',
    chartType: 'area',
    dataKey: 'gpuNodes',
    xAxis: 'timestamp',
    yAxis: ['allocated', 'free'],
    colors: [PURPLE_600, GREEN_500_BRIGHT],
  },
  emptyState: { icon: 'Cpu', title: 'No GPU History', message: 'No historical GPU data available yet', variant: 'info' },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
export default gpuInventoryHistoryConfig
