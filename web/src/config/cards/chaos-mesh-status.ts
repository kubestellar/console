/**
 * Chaos Mesh Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const chaosMeshStatusConfig: UnifiedCardConfig = {
  type: 'chaos_mesh_status',
  title: 'Chaos Mesh',
  category: 'runtime',
  description: 'Chaos Mesh experiment status and workflow progress.',
  icon: 'Zap',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 3,

  dataSource: {
    type: 'hook',
    hook: 'useChaosMeshStatus',
  },

  content: {
    type: 'status-grid',
    columns: 2,
    items: [
      {
        id: 'total',
        label: 'Total Experiments',
        icon: 'Activity',
        color: 'blue',
        valueSource: { type: 'field', path: 'summary.totalExperiments' },
      },
      {
        id: 'running',
        label: 'Running',
        icon: 'Activity',
        color: 'green',
        valueSource: { type: 'field', path: 'summary.running' },
      },
      {
        id: 'failed',
        label: 'Failed',
        icon: 'XCircle',
        color: 'red',
        valueSource: { type: 'field', path: 'summary.failed' },
      },
      {
        id: 'workflows',
        label: 'Workflows',
        icon: 'Workflow',
        color: 'purple',
        valueSource: { type: 'field', path: 'workflows.length' },
      },
    ],
  },

  emptyState: {
    icon: 'Zap',
    title: 'Chaos Mesh not detected',
    message: 'No PodChaos or Workflow resources found on connected clusters.',
    variant: 'neutral',
  },

  isDemoData: true,
  isLive: true,
}

export default chaosMeshStatusConfig
