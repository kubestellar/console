/**
 * OpenFGA Status Card Configuration
 *
 * OpenFGA is a CNCF Sandbox fine-grained authorization system inspired by
 * Google's Zanzibar paper. This card surfaces the reachable endpoint, store
 * and authorization-model counts, relationship-tuple totals, per-API
 * throughput (Check / Expand / ListObjects), and latency percentiles.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const openfgaStatusConfig: UnifiedCardConfig = {
  type: 'openfga_status',
  title: 'OpenFGA',
  category: 'security',
  description:
    'OpenFGA fine-grained authorization: stores, authorization models, relationship tuples, API throughput (Check/Expand/ListObjects), and latency percentiles.',
  icon: 'Shield',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedOpenfga' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Store', primary: true, render: 'truncate' },
      { field: 'tupleCount', header: 'Tuples', width: 100 },
      { field: 'modelCount', header: 'Models', width: 80 },
      { field: 'status', header: 'Status', width: 100, render: 'status-badge' },
      { field: 'lastWriteTime', header: 'Last Write', width: 140 },
    ],
  },
  emptyState: {
    icon: 'Shield',
    title: 'OpenFGA not detected',
    message: 'No OpenFGA server reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/openfga/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default openfgaStatusConfig
