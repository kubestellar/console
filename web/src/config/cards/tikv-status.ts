/**
 * TiKV Status Card Configuration
 *
 * Displays TiKV distributed key-value store nodes, region counts,
 * and capacity utilization for a TiKV (CNCF graduated) cluster.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const tikvStatusConfig: UnifiedCardConfig = {
  type: 'tikv_status',
  title: 'TiKV',
  category: 'storage',
  description: 'TiKV distributed key-value store: store nodes, regions, leaders, and capacity.',

  // Appearance
  icon: 'Database',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedTikv',
  },

  // Content — list visualization with store rows
  content: {
    type: 'list',
    pageSize: 6,
    columns: [
      { field: 'storeId', header: 'Store', primary: true, width: 80 },
      { field: 'address', header: 'Address', render: 'truncate' },
      { field: 'state', header: 'State', width: 80, render: 'status-badge' },
      { field: 'regionCount', header: 'Regions', width: 100 },
      { field: 'leaderCount', header: 'Leaders', width: 100 },
    ],
  },

  emptyState: {
    icon: 'Database',
    title: 'TiKV not detected',
    message: 'No TiKV store pods found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 4,
  },

  isDemoData: false,
  isLive: true,
}

export default tikvStatusConfig
