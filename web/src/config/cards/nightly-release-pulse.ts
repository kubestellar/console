/**
 * Nightly Release Pulse Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const nightlyReleasePulseConfig: UnifiedCardConfig = {
  type: 'nightly_release_pulse',
  title: 'Nightly Release Pulse',
  category: 'ci-cd',
  description: 'Last release, success/failure streak, next nightly, 14-day history',
  icon: 'Activity',
  iconColor: 'text-green-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'usePipelinePulse' },
  content: { type: 'custom', component: 'NightlyReleasePulse' },
  emptyState: { icon: 'Activity', title: 'No nightly data', message: 'Waiting for the next scheduled release run', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: true,
  isLive: true,
}
export default nightlyReleasePulseConfig
