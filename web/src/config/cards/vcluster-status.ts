/**
 * vCluster Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const vclusterStatusConfig: UnifiedCardConfig = {
  type: 'vcluster_status',
  title: 'vCluster Status',
  category: 'compute',
  description: 'Virtual cluster status and health',
  icon: 'Layers',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useVClusterStatus' },
  content: {
    type: 'list',
    pageSize: 10,
    columns: [
      { field: 'name', header: 'vCluster', primary: true, render: 'truncate' },
      { field: 'hostCluster', header: 'Host Cluster', render: 'text', width: 100 },
      { field: 'k8sVersion', header: 'Version', render: 'text', width: 80 },
      { field: 'status', header: 'Status', render: 'status-badge', width: 80 },
    ],
  },
  emptyState: { icon: 'Layers', title: 'No vClusters', message: 'No virtual clusters found', variant: 'info' },
  loadingState: { type: 'list', rows: 5 },
  isDemoData: true,
  isLive: false,
}
export default vclusterStatusConfig
