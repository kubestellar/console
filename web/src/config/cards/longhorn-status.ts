/**
 * Longhorn Status Card Configuration
 *
 * Longhorn (CNCF Incubating) is a cloud-native distributed block storage
 * system for Kubernetes. This card surfaces volume state and robustness,
 * per-node storage utilization, replica health, and cluster-wide capacity.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const longhornStatusConfig: UnifiedCardConfig = {
  type: 'longhorn_status',
  title: 'Longhorn',
  category: 'storage',
  description:
    'Longhorn distributed block storage: volumes (state/robustness), node status, replica health, and capacity utilization.',

  // Appearance
  icon: 'HardDrive',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedLonghorn',
  },

  // Content — list visualization with volume rows
  content: {
    type: 'list',
    pageSize: 6,
    columns: [
      { field: 'name', header: 'Volume', primary: true, render: 'truncate' },
      { field: 'robustness', header: 'Robustness', width: 120, render: 'status-badge' },
      { field: 'state', header: 'State', width: 100 },
      { field: 'replicasHealthy', header: 'Replicas', width: 90 },
      { field: 'sizeBytes', header: 'Size', width: 100 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },

  emptyState: {
    icon: 'HardDrive',
    title: 'Longhorn not detected',
    message: 'No Longhorn volumes or nodes found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 5,
  },

  // Renders live when /api/longhorn/status is wired up; otherwise falls
  // back to demo data via the useCache demoData path.
  isDemoData: false,
  isLive: true,
}

export default longhornStatusConfig
