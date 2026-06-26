/**
 * Recent Failures Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const recentFailuresConfig: UnifiedCardConfig = {
  type: 'recent_failures',
  title: 'Recent Failures',
  category: 'ci-cd',
  description: 'Last failed GitHub Actions runs with log drill-down and re-run',
  icon: 'AlertTriangle',
  iconColor: 'text-red-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'usePipelineFailures' },
  content: { type: 'custom', component: 'RecentFailures' },
  emptyState: { icon: 'CheckCircle2', title: 'No recent failures', message: 'All workflows green', variant: 'success' },
  loadingState: { type: 'custom' },
  isDemoData: true,
  isLive: true,
}
export default recentFailuresConfig
