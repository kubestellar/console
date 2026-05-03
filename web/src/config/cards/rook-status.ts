/**
 * Rook Status Card Configuration
 *
 * Displays Rook-managed CephClusters (CNCF graduated cloud-native storage
 * orchestrator) — per-CephCluster health, OSD/MON/MGR counts, and capacity.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const rookStatusConfig: UnifiedCardConfig = {
  type: 'rook_status',
  title: 'Rook',
  category: 'storage',
  description:
    'Rook-managed CephClusters: Ceph health, OSD/MON/MGR counts, capacity, and PG state.',

  // Appearance
  icon: 'Database',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedRook',
  },

  // Content — list visualization with CephCluster rows
  content: {
    type: 'list',
    pageSize: 6,
    columns: [
      { field: 'name', header: 'CephCluster', primary: true, render: 'truncate' },
      { field: 'cephHealth', header: 'Health', width: 120, render: 'status-badge' },
      { field: 'osdUp', header: 'OSD Up', width: 90 },
      { field: 'osdTotal', header: 'OSD Total', width: 90 },
      { field: 'capacityUsedBytes', header: 'Used', width: 120 },
      { field: 'capacityTotalBytes', header: 'Total', width: 120 },
    ],
  },

  emptyState: {
    icon: 'Database',
    title: 'Rook not detected',
    message: 'No CephCluster resources found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 4,
  },

  isDemoData: false,
  isLive: true,
}

export default rookStatusConfig
