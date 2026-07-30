/**
 * Envoy Proxy Status Card Configuration
 *
 * Envoy is a CNCF graduated edge/service proxy. This card surfaces
 * listener health, upstream cluster health, and basic admin stats.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const envoyStatusConfig: UnifiedCardConfig = {
  type: 'envoy_status',
  title: 'Envoy Proxy',
  category: 'network',
  description:
    'Envoy Proxy listener health, upstream cluster health, and request/connection stats.',
  icon: 'Network',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedEnvoy' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'address', header: 'Address', width: 140, render: 'truncate' },
      { field: 'port', header: 'Port', width: 80 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
      { field: 'status', header: 'Status', width: 80, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'Network',
    title: 'Envoy not detected',
    message: 'No Envoy admin endpoint reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/envoy/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default envoyStatusConfig
