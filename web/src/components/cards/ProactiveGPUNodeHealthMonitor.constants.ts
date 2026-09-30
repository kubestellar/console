/**
 * Shared sort/tier/check constants for ProactiveGPUNodeHealthMonitor.
 *
 * Extracted from ProactiveGPUNodeHealthMonitor.tsx to keep the main component
 * focused on data orchestration and rendering.
 */

// Sort field options
export type SortField = 'status' | 'nodeName' | 'cluster' | 'gpuCount'
export type SortDirection = 'asc' | 'desc'

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'gpuCount', label: 'GPU Count' },
]

export const STATUS_ORDER: Record<string, number> = { unhealthy: 0, degraded: 1, healthy: 2 }

export const PAGE_SIZE = 5

export const DEFAULT_SCHEDULE = '*/5 * * * *'
export const DEFAULT_NAMESPACE = 'nvidia-gpu-operator'
export const DEFAULT_TIER = 2

export const TIER_OPTIONS = [
  { value: 1, label: 'Tier 1 — Critical', description: 'Node ready, cordoned, stuck pods, operator pods, GPU events' },
  { value: 2, label: 'Tier 2 — Standard', description: '+ GPU capacity, pending pods, driver, node conditions, quotas' },
  { value: 3, label: 'Tier 3 — Full', description: '+ Utilization, MIG drift, RDMA, failed jobs, evictions' },
  { value: 4, label: 'Tier 4 — Deep', description: '+ nvidia-smi, dmesg, NVLink (requires privileged access)' },
]

// Human-readable check names
export const CHECK_LABELS: Record<string, string> = {
  node_ready: 'Node Ready',
  scheduling: 'Scheduling',
  'gpu-feature-discovery': 'GPU Feature Discovery',
  'nvidia-device-plugin': 'Device Plugin',
  'dcgm-exporter': 'DCGM Exporter',
  stuck_pods: 'Stuck Pods',
  gpu_events: 'GPU Events',
}
