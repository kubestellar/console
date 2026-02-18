/**
 * Proactive GPU Node Health Monitor Card Configuration
 *
 * Monitors GPU node health across clusters. Checks node readiness,
 * scheduling, GPU operator pods, stuck pods, and GPU reset events.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const gpuNodeHealthConfig: UnifiedCardConfig = {
  type: 'gpu_node_health',
  title: 'Proactive GPU Node Health Monitor',
  category: 'cluster-health',
  description: 'Proactive health monitoring for GPU nodes — checks node readiness, GPU operator pods, stuck pods, and GPU reset events',
  icon: 'Activity',
  iconColor: 'text-emerald-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useGPUNodeHealth' },
  content: {
    type: 'list',
    pageSize: 5,
    columns: [
      { field: 'nodeName', header: 'Node', primary: true },
      { field: 'cluster', header: 'Cluster', render: 'cluster-badge', width: 100 },
      { field: 'status', header: 'Status', render: 'severity-badge', width: 80 },
      { field: 'gpuCount', header: 'GPUs', width: 50 },
      { field: 'issues', header: 'Issues', width: 200 },
    ],
  },
  emptyState: {
    icon: 'CheckCircle',
    title: 'No GPU Nodes',
    message: 'Connect clusters with GPU nodes to enable health monitoring',
    variant: 'info',
  },
  loadingState: { type: 'list', rows: 3 },
  isDemoData: false,
  isLive: true,
}

export default gpuNodeHealthConfig
