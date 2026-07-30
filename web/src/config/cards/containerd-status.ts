/**
 * Containerd Status Card Configuration
 *
 * Marketplace preset: cncf-containerd
 * Upstream issue: kubestellar/console-marketplace#4
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const containerdStatusConfig: UnifiedCardConfig = {
  type: 'containerd_status',
  title: 'Containerd',
  // 'runtime' isn't a CardCategory — use 'compute' (closest semantic fit;
  // CRI-O follows the same pattern and lives under Misc in the catalog).
  category: 'compute',
  description: 'Containerd container runtime — running containers, image, namespace, state, uptime.',
  icon: 'Box',
  iconColor: 'text-blue-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedContainerd' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'id', header: 'ID', primary: true, render: 'truncate' },
      { field: 'image', header: 'Image', render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 120, render: 'namespace-badge' },
      { field: 'state', header: 'State', width: 80, render: 'status-badge' },
      { field: 'uptime', header: 'Uptime', width: 100, render: 'truncate' },
    ],
  },
  emptyState: {
    icon: 'Box',
    title: 'containerd not detected',
    message: 'No nodes on connected clusters report containerd as their runtime.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  isDemoData: false,
  isLive: true,
}

export default containerdStatusConfig
