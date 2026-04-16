import type { UnifiedCardConfig } from '../../lib/unified/types'

export const acmmRecommendationsConfig: UnifiedCardConfig = {
  type: 'acmm_recommendations',
  title: 'Your Role + Next Steps',
  category: 'maturity',
  description: 'Current role and prioritized missing feedback loops for the next level',
  icon: 'Sparkles',
  iconColor: 'text-primary',
  defaultWidth: 6,
  defaultHeight: 5,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'ACMMRecommendations' },
  emptyState: { icon: 'Sparkles', title: 'No recommendations yet', message: 'Enter a repo to get next-level guidance', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}

export default acmmRecommendationsConfig
