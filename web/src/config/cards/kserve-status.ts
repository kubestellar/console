/**
 * KServe Status Card Configuration
 *
 * KServe is a CNCF incubating model-serving platform on Kubernetes. It
 * surfaces AI / ML inference workloads as declarative `InferenceService`
 * custom resources. This card monitors the KServe control plane, per-service
 * readiness, predictor replica counts, canary traffic split, and serving
 * throughput / latency.
 *
 * Source: kubestellar/console-marketplace#38
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kserveStatusConfig: UnifiedCardConfig = {
  type: 'kserve_status',
  title: 'KServe',
  category: 'ai-ml',
  description:
    'KServe InferenceService readiness, predictor replica status, canary traffic split, and serving throughput / latency across clusters.',
  icon: 'BrainCircuit',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedKserve' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'status', header: 'Status', width: 100, render: 'status-badge' },
      { field: 'modelName', header: 'Model', width: 160, render: 'truncate' },
      { field: 'runtime', header: 'Runtime', width: 160, render: 'truncate' },
      { field: 'readyReplicas', header: 'Ready', width: 80 },
      { field: 'trafficPercent', header: 'Traffic %', width: 100 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'BrainCircuit',
    title: 'KServe not detected',
    message:
      'No KServe controller pods found in the connected clusters. Deploy KServe to monitor model-serving inference workloads.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/kserve/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default kserveStatusConfig
