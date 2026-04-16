/**
 * Workflow Matrix Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const workflowMatrixConfig: UnifiedCardConfig = {
  type: 'workflow_matrix',
  title: 'Workflow Matrix',
  category: 'ci-cd',
  description: 'Heatmap of all workflows × last 14 / 30 / 90 days',
  icon: 'Grid3x3',
  iconColor: 'text-blue-400',
  defaultWidth: 6,
  defaultHeight: 5,
  dataSource: { type: 'hook', hook: 'usePipelineMatrix' },
  content: { type: 'custom', component: 'WorkflowMatrix' },
  emptyState: { icon: 'Grid3x3', title: 'No workflow activity', message: 'No runs recorded in this range', variant: 'info' },
  loadingState: { type: 'custom' },
  isDemoData: true,
  isLive: true,
}
export default workflowMatrixConfig
