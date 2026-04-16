import type { UnifiedCardConfig } from '../../lib/unified/types'

export const acmmBalanceConfig: UnifiedCardConfig = {
  type: 'acmm_balance',
  title: 'Human vs AI Balance',
  category: 'maturity',
  description: 'Weekly AI vs human contribution trend with a balance target',
  icon: 'TrendingUp',
  iconColor: 'text-cyan-400',
  defaultWidth: 8,
  defaultHeight: 4,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'ACMMBalance' },
  emptyState: { icon: 'TrendingUp', title: 'No activity yet', message: 'Enter a repo to see its contribution balance', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}

export default acmmBalanceConfig
