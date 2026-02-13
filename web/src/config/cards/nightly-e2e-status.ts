/**
 * Nightly E2E Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const nightlyE2eStatusConfig: UnifiedCardConfig = {
  type: 'nightly_e2e_status',
  title: 'Nightly E2E Status',
  category: 'ci-cd',
  description: 'llm-d nightly E2E workflow status across OCP and GKE platforms',
  icon: 'TestTube2',
  iconColor: 'text-emerald-400',
  defaultWidth: 12,
  defaultHeight: 5,
  dataSource: { type: 'hook', hook: 'useNightlyE2EData' },
  content: { type: 'custom', component: 'NightlyE2EStatusView' },
  emptyState: { icon: 'TestTube2', title: 'No E2E Data', message: 'Configure a GitHub token to see nightly E2E status', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: false,
  isLive: true,
}
export default nightlyE2eStatusConfig
