/**
 * Kubecost Overview Card Configuration
 */
import { AMBER_500, BLUE_500, GREEN_500, RED_500 } from '../../lib/theme/chartColors'
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kubecostOverviewConfig: UnifiedCardConfig = {
  type: 'kubecost_overview',
  title: 'Kubecost',
  category: 'cost',
  description: 'Kubecost cost allocation',
  icon: 'Wallet',
  iconColor: 'text-blue-400',
  defaultWidth: 8,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useKubecostOverview' },
  content: {
    type: 'chart',
    chartType: 'donut',
    dataKey: 'breakdown',
    valueKey: 'cost',
    labelKey: 'category',
    colors: [BLUE_500, GREEN_500, AMBER_500, RED_500],
  },
  emptyState: { icon: 'Wallet', title: 'No Cost Data', message: 'Kubecost not configured', variant: 'info' },
  loadingState: { type: 'chart' },
  isDemoData: true,
  isLive: false,
}
export default kubecostOverviewConfig
