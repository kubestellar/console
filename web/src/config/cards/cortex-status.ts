/**
 * Cortex Status Card Configuration
 *
 * Cortex is a CNCF incubating project providing a horizontally scalable,
 * highly available, multi-tenant, long-term storage backend for Prometheus.
 * This card surfaces:
 *
 * - Microservice pod health (distributor, ingester, querier, store-gateway,
 *   ruler, alertmanager)
 * - Active series, ingestion rate (samples/sec), query rate (queries/sec)
 * - Tenant count (multi-tenancy fan-out)
 *
 * Source: kubestellar/console-marketplace#35
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const cortexStatusConfig: UnifiedCardConfig = {
  type: 'cortex_status',
  title: 'Cortex',
  // 'live-trends' matches sibling observability cards (OpenTelemetry,
  // Jaeger) whose underlying CardCategory union does not include a
  // dedicated "observability" value.
  category: 'live-trends',
  description:
    'Cortex (CNCF incubating) — horizontally scalable Prometheus: microservice health, active series, ingestion rate, query rate, and tenant count.',
  icon: 'Database',
  iconColor: 'text-emerald-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedCortex' },
  content: {
    type: 'list',
    pageSize: 6,
    columns: [
      { field: 'name', header: 'Component', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'replicasReady', header: 'Ready', width: 80 },
      { field: 'replicasDesired', header: 'Desired', width: 90 },
      { field: 'status', header: 'Status', width: 110, render: 'status-badge' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Database',
    title: 'Cortex not detected',
    message:
      'No Cortex services reachable from the connected clusters. Deploy Cortex to store long-term Prometheus data.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 6,
  },
  // Scaffolding: renders live if /api/cortex/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default cortexStatusConfig
