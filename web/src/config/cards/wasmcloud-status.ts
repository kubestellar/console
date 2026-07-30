/**
 * wasmCloud Status Card Configuration
 *
 * wasmCloud is a CNCF incubating platform for distributed WebAssembly
 * applications. A wasmCloud lattice is a self-forming mesh of hosts that
 * run portable Wasm actors (business logic) linked at runtime to
 * capability providers (HTTP server, NATS, Redis, Postgres, ...) via
 * declarative link definitions. This card surfaces host count, actor and
 * provider counts, and active links across the connected lattices.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const wasmcloudStatusConfig: UnifiedCardConfig = {
  type: 'wasmcloud_status',
  title: 'wasmCloud',
  category: 'workloads',
  description:
    'wasmCloud lattice status: hosts, actors, capability providers, and link definitions across connected clusters.',
  icon: 'Box',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedWasmcloud' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'friendlyName', header: 'Host', primary: true, render: 'truncate' },
      { field: 'hostId', header: 'Host ID', width: 160, render: 'truncate' },
      { field: 'status', header: 'Status', width: 100, render: 'status-badge' },
      { field: 'actorCount', header: 'Actors', width: 80 },
      { field: 'providerCount', header: 'Providers', width: 100 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Box',
    title: 'wasmCloud not detected',
    message: 'No wasmCloud lattice reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/wasmcloud/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default wasmcloudStatusConfig
