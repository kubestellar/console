import type { UnifiedCardConfig } from '../../lib/unified/types'

export const acmmFeedbackLoopsConfig: UnifiedCardConfig = {
  type: 'acmm_feedback_loops',
  title: 'Feedback Loop Inventory',
  category: 'maturity',
  description: 'All criteria from ACMM + fullsend + AEF + claude-reflect',
  icon: 'ListChecks',
  iconColor: 'text-green-400',
  defaultWidth: 6,
  defaultHeight: 5,
  dataSource: { type: 'static' },
  content: { type: 'custom', component: 'ACMMFeedbackLoops' },
  emptyState: { icon: 'ListChecks', title: 'No criteria yet', message: 'Enter a repo to inventory its feedback loops', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}

export default acmmFeedbackLoopsConfig
