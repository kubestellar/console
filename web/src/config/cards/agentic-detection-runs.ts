/**
 * Agentic Detection Runs Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const agenticDetectionRunsConfig: UnifiedCardConfig = {
  type: 'agentic_detection_runs',
  title: 'Detection Runs',
  category: 'ci-cd',
  description: 'Track agentic workflow runs where threat detection flagged problems',
  icon: 'ShieldAlert',
  iconColor: 'text-yellow-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useAgenticDetectionRuns' },
  content: { type: 'custom', component: 'AgenticDetectionRuns' },
  emptyState: {
    icon: 'CheckCircle',
    title: 'No Detection Problems',
    message: 'All agentic workflows completed without warnings or failures',
    variant: 'success',
  },
  loadingState: { type: 'list', rows: 5 },
  isDemoData: true,
  isLive: true,
}
export default agenticDetectionRunsConfig
