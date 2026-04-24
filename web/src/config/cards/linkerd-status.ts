/**
 * Linkerd Service Mesh Status Card Configuration
 *
 * Linkerd is a CNCF graduated service mesh. This card surfaces meshed
 * deployments with golden-signals metrics (success rate, RPS, p99 latency)
 * as seen by the Linkerd Viz extension.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const linkerdStatusConfig: UnifiedCardConfig = {
  type: 'linkerd_status',
  title: 'Linkerd',
  category: 'network',
  description:
    'Linkerd service mesh meshed pods, success rate, RPS, and p99 latency per deployment.',
  icon: 'Network',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedLinkerd' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'deployment', header: 'Deployment', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'meshedPods', header: 'Meshed', width: 80 },
      { field: 'successRatePct', header: 'Success', width: 90 },
      { field: 'requestsPerSecond', header: 'RPS', width: 80 },
      { field: 'p99LatencyMs', header: 'p99', width: 80 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
      { field: 'status', header: 'Status', width: 90, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'Network',
    title: 'Linkerd not detected',
    message: 'No Linkerd control plane reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/linkerd/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default linkerdStatusConfig
