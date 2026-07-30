/**
 * Dragonfly Status Card Configuration
 *
 * Displays Dragonfly (CNCF graduated) P2P image and file distribution
 * health across connected clusters: manager/scheduler replicas,
 * seed-peer count, per-node dfdaemon readiness, active tasks, and
 * peer-cache hit rate.
 *
 * Marketplace preset: cncf-dragonfly — kubestellar/console-marketplace#22
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const dragonflyStatusConfig: UnifiedCardConfig = {
  type: 'dragonfly_status',
  title: 'Dragonfly',
  category: 'workloads',
  description:
    'Dragonfly P2P image/file distribution: manager, scheduler, seed-peers, and per-node dfdaemon agents.',

  // Appearance
  icon: 'Zap',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source
  dataSource: {
    type: 'hook',
    hook: 'useCachedDragonfly',
  },

  // Content — list visualization with component rows
  content: {
    type: 'list',
    pageSize: 4,
    columns: [
      { field: 'component', header: 'Component', primary: true, width: 120 },
      { field: 'name', header: 'Name', render: 'truncate' },
      { field: 'ready', header: 'Ready', width: 80 },
      { field: 'desired', header: 'Desired', width: 80 },
      { field: 'version', header: 'Version', width: 100 },
    ],
  },

  emptyState: {
    icon: 'Zap',
    title: 'Dragonfly not detected',
    message:
      'No Dragonfly manager, scheduler, seed-peer, or dfdaemon pods found on connected clusters.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 4,
  },

  isDemoData: false,
  isLive: true,
}

export default dragonflyStatusConfig
