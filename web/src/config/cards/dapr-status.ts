/**
 * Dapr Status Card Configuration
 *
 * Dapr (Distributed Application Runtime) is a CNCF graduated project that
 * provides portable microservice APIs (state management, pub/sub, bindings,
 * service invocation). This card surfaces:
 *
 * - Control plane pod health (operator, placement, sentry, sidecarInjector)
 * - Number of apps with a Dapr sidecar injected
 * - Configured components grouped by building block (state store, pub/sub,
 *   binding)
 *
 * Source: kubestellar/console-marketplace#21
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const daprStatusConfig: UnifiedCardConfig = {
  type: 'dapr_status',
  title: 'Dapr',
  category: 'workloads',
  description:
    'Dapr control plane health, Dapr-enabled application count, and configured components (state store / pub-sub / binding).',
  icon: 'Boxes',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedDapr' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'type', header: 'Type', width: 110, render: 'status-badge' },
      { field: 'componentImpl', header: 'Impl', width: 140, render: 'truncate' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Boxes',
    title: 'Dapr not detected',
    message: 'No Dapr control plane reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/dapr/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default daprStatusConfig
