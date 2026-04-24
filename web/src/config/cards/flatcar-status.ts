/**
 * Flatcar Container Linux Status Card Configuration
 *
 * Flatcar Container Linux is a CNCF incubating immutable container OS.
 * This card surfaces per-node OS image, running Flatcar versions, update
 * channels (stable / beta / alpha / lts), pending updates, and nodes
 * awaiting reboot.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const flatcarStatusConfig: UnifiedCardConfig = {
  type: 'flatcar_status',
  title: 'Flatcar Container Linux',
  // 'operations' is not a member of CardCategory — 'workloads' covers node
  // OS / fleet operations concerns in the current taxonomy.
  category: 'workloads',
  description:
    'Flatcar Container Linux node status: OS image, running versions, update channels, and pending reboots.',
  icon: 'Server',
  iconColor: 'text-blue-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedFlatcar' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Node', primary: true, render: 'truncate' },
      { field: 'currentVersion', header: 'Version', width: 120 },
      { field: 'channel', header: 'Channel', width: 100, render: 'status-badge' },
      { field: 'state', header: 'State', width: 140, render: 'status-badge' },
      { field: 'cluster', header: 'Cluster', width: 140, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Server',
    title: 'No Flatcar nodes detected',
    message: 'No nodes running Flatcar Container Linux reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/flatcar/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default flatcarStatusConfig
