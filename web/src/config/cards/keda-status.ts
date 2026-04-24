/**
 * KEDA Status Card Configuration
 *
 * KEDA (Kubernetes Event-Driven Autoscaling) is a CNCF graduated project
 * for event-driven autoscaling of Kubernetes workloads. This card surfaces
 * the KEDA operator health plus per-ScaledObject replica state and trigger
 * metadata (Kafka / Prometheus / Cron / SQS / RabbitMQ / Redis / etc.).
 *
 * The runtime card component lives at
 * `components/cards/keda_status/KedaStatus.tsx` and drives its own layout;
 * this config exists so the card participates in the unified registry
 * (browse catalog, search, marketplace mapping).
 *
 * Implements kubestellar/console-marketplace#23.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kedaStatusConfig: UnifiedCardConfig = {
  type: 'keda_status',
  title: 'KEDA',
  category: 'workloads',
  description:
    'KEDA event-driven autoscaling: ScaledObject status, triggers (Kafka/Prometheus/Cron/SQS), and replica counts.',

  // Appearance
  icon: 'TrendingUp',
  iconColor: 'text-green-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source — routes through the unified registry to useCachedKeda,
  // which is wired up in lib/unified/registerHooks.ts.
  dataSource: {
    type: 'hook',
    hook: 'useCachedKeda',
  },

  // Content — list visualization with ScaledObject rows.
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'ScaledObject', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'target', header: 'Target', width: 160, render: 'truncate' },
      { field: 'currentReplicas', header: 'Current', width: 80, align: 'right' },
      { field: 'maxReplicas', header: 'Max', width: 70, align: 'right' },
      { field: 'status', header: 'Status', width: 90, render: 'status-badge' },
    ],
  },

  emptyState: {
    icon: 'TrendingUp',
    title: 'KEDA not detected',
    message:
      'No KEDA operator pods found. Deploy KEDA to enable event-driven autoscaling.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 5,
  },

  // The card does its own live/demo gating via useKedaStatus; keep the
  // registry flags aligned with TiKV / HPA (live when data available,
  // demo fallback handled by the cache layer).
  isDemoData: false,
  isLive: true,
}

export default kedaStatusConfig
