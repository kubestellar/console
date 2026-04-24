/**
 * Strimzi Status Card Configuration
 *
 * Strimzi is a CNCF Incubating project that runs Apache Kafka on Kubernetes.
 * This card surfaces Kafka cluster health, broker readiness, topic counts,
 * consumer groups, and end-to-end lag across every Kafka CR managed by the
 * Strimzi Cluster Operator.
 *
 * Category `live-trends` groups this under observability / event-stream
 * cards — the Kafka lag signal is an always-moving trend, not a static
 * security/posture state.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const strimziStatusConfig: UnifiedCardConfig = {
  type: 'strimzi_status',
  title: 'Strimzi',
  category: 'live-trends',
  description:
    'Strimzi-managed Apache Kafka clusters: broker readiness, topic counts, consumer groups, and end-to-end lag.',
  icon: 'MessageSquare',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedStrimzi' },
  content: {
    type: 'list',
    pageSize: 6,
    columns: [
      { field: 'name', header: 'Cluster', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'health', header: 'Health', width: 100, render: 'status-badge' },
      { field: 'brokers', header: 'Brokers', width: 90 },
      { field: 'totalLag', header: 'Lag', width: 100 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'MessageSquare',
    title: 'Strimzi not detected',
    message: 'No Strimzi Cluster Operator or Kafka custom resources found in the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 4,
  },
  // Scaffolding: renders live if /api/strimzi/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default strimziStatusConfig
