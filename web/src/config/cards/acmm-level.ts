import type { UnifiedCardConfig } from '../../lib/unified/types'

export const acmmLevelConfig: UnifiedCardConfig = {
  type: 'acmm_level',
  title: 'Current Level',
  category: 'maturity',
  description: 'ACMM level gauge for the selected repo',
  icon: 'BarChart3',
  iconColor: 'text-primary',
  defaultWidth: 4,
  defaultHeight: 4,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'ACMMLevel' },
  emptyState: { icon: 'BarChart3', title: 'No scan yet', message: 'Enter a repo to compute its ACMM level', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}

export default acmmLevelConfig
