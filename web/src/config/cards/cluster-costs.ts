/**
 * Cluster Costs Card Configuration
 */
import { AMBER_500, BLUE_500, GREEN_500 } from '../../lib/theme/chartColors'
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const clusterCostsConfig: UnifiedCardConfig = {
  type: 'cluster_costs',
  title: 'Cluster Costs',
  category: 'cost',
  description: 'Cost allocation by cluster',
  icon: 'DollarSign',
  iconColor: 'text-green-400',
  defaultWidth: 8,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useClusterCosts' },
  content: {
    type: 'chart',
    chartType: 'bar',
    dataKey: 'clusters',
    xAxis: 'cluster',
    yAxis: ['compute', 'storage', 'network'],
    colors: [BLUE_500, GREEN_500, AMBER_500],
  },
  emptyState: { icon: 'DollarSign', title: 'No Cost Data', message: 'Cost data not available', variant: 'info' },
  loadingState: { type: 'chart' },
  isDemoData: false,
  isLive: true,
}
export default clusterCostsConfig
