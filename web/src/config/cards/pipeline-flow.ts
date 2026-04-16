/**
 * Pipeline Flow Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const pipelineFlowConfig: UnifiedCardConfig = {
  type: 'pipeline_flow',
  title: 'Live Runs',
  category: 'ci-cd',
  description: 'Drasi-style visualization of in-flight GitHub Actions runs',
  icon: 'GitBranch',
  iconColor: 'text-purple-400',
  defaultWidth: 12,
  defaultHeight: 5,
  dataSource: { type: 'hook', hook: 'usePipelineFlow' },
  content: { type: 'custom', component: 'PipelineFlow' },
  emptyState: { icon: 'GitBranch', title: 'No runs in flight', message: 'All workflows idle', variant: 'success' },
  loadingState: { type: 'custom' },
  isDemoData: true,
  isLive: true,
}
export default pipelineFlowConfig
