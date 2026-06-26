/**
 * gRPC Service Status Card Configuration
 *
 * gRPC is a CNCF graduated high-performance RPC framework. This card
 * surfaces service serving status, per-service RPS, p99 latency, and
 * error rate.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const grpcStatusConfig: UnifiedCardConfig = {
  type: 'grpc_status',
  title: 'gRPC Services',
  category: 'network',
  description:
    'gRPC service health, call metrics (RPS, p99 latency), and error rates.',
  icon: 'Network',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedGrpc' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Service', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 120, render: 'truncate' },
      { field: 'endpoints', header: 'Endpoints', width: 90 },
      { field: 'rps', header: 'RPS', width: 80 },
      { field: 'latencyP99Ms', header: 'p99 ms', width: 80 },
      { field: 'status', header: 'Status', width: 80, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'Network',
    title: 'No gRPC services detected',
    message: 'No gRPC reflection endpoint reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/grpc/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default grpcStatusConfig
