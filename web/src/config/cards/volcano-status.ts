/**
 * Volcano Status Card Configuration
 *
 * Volcano is a CNCF Incubating batch/HPC scheduler for Kubernetes — the
 * de-facto scheduler for AI/ML training, HPC, and big-data workloads. It
 * extends the default Kubernetes scheduler with gang scheduling, fair-share
 * queues, preemption, and per-job resource accounting.
 *
 * This card surfaces queues, jobs (pending/running/completed/failed), pod
 * groups, and aggregate GPU allocation.
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const volcanoStatusConfig: UnifiedCardConfig = {
  type: 'volcano_status',
  title: 'Volcano',
  category: 'workloads',
  description:
    'Volcano batch/HPC scheduler: queues, jobs (pending/running/completed/failed), pod groups, and GPU allocation.',
  icon: 'Layers',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedVolcano' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Job', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'queue', header: 'Queue', width: 140, render: 'truncate' },
      { field: 'phase', header: 'Phase', width: 100, render: 'status-badge' },
      { field: 'gpuRequest', header: 'GPU', width: 80 },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },
  emptyState: {
    icon: 'Layers',
    title: 'Volcano scheduler not detected',
    message: 'No Volcano scheduler reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/volcano/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default volcanoStatusConfig
