import type { NavigateFunction } from 'react-router-dom'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
import { ROUTES } from '../../config/routes'
import { formatMemoryStat } from '../../lib/formatStats'
import type { StatBlockValue } from '../ui/StatsOverview'
import type { ClusterHealthFilter } from './useClusterViewState'
import type { useClusterStats } from './useClusterStats'

export interface ClusterStatValueCallbacks {
  navigate: NavigateFunction
  setFilter: (filter: ClusterHealthFilter) => void
  setShowClusterGrid: (show: boolean) => void
  openGPUModal: () => void
}

/**
 * Pure mapping from a StatsOverview block id to its display value/click
 * handler for the Clusters page. Extracted from Clusters.tsx (#21617) as a
 * plain function (not a hook) since it has no hook dependencies of its own,
 * reducing the component's hook count and line count.
 */
export function getClusterDashboardStatValue(
  blockId: string,
  stats: ReturnType<typeof useClusterStats>,
  hasData: boolean,
  clusterStatusProgressMax: number,
  { navigate, setFilter, setShowClusterGrid, openGPUModal }: ClusterStatValueCallbacks,
): StatBlockValue {
  switch (blockId) {
    case 'clusters':
      return {
        value: stats.total,
        groundtruthField: 'clusters-total',
        sublabel: 'total clusters',
        onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('all'); setShowClusterGrid(true) },
        isClickable: stats.total > 0 }
    case 'healthy':
      return {
        value: stats.healthy,
        groundtruthField: 'clusters-healthy',
        sublabel: 'healthy',
        max: clusterStatusProgressMax,
        onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('healthy'); setShowClusterGrid(true) },
        isClickable: stats.healthy > 0 }
    case 'unhealthy':
      return {
        value: stats.unhealthy,
        sublabel: 'unhealthy',
        max: clusterStatusProgressMax,
        onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unhealthy'); setShowClusterGrid(true) },
        isClickable: stats.unhealthy > 0 }
    case 'unreachable':
      return {
        value: stats.unreachable,
        sublabel: 'offline',
        max: clusterStatusProgressMax,
        onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unreachable'); setShowClusterGrid(true) },
        isClickable: stats.unreachable > 0 }
    case 'nodes':
      return {
        value: hasData ? stats.totalNodes : '-',
        groundtruthFields: {
          'nodes-total': hasData ? stats.totalNodes : '-',
          'nodes-ready': stats.healthyNodes,
        },
        progressValue: stats.healthyNodes,
        max: stats.totalNodes,
        sublabel: 'total nodes',
        onClick: () => { emitClusterStatsDrillDown('nodes'); navigate(ROUTES.COMPUTE) },
        isClickable: hasData }
    case 'cpus':
      return {
        value: hasData ? stats.totalCPUs : '-',
        sublabel: 'cores allocatable',
        onClick: () => { emitClusterStatsDrillDown('cpu'); navigate(ROUTES.COMPUTE) },
        isClickable: hasData }
    case 'memory':
      return {
        value: hasData ? formatMemoryStat(stats.totalMemoryGB) : '-',
        sublabel: 'allocatable',
        onClick: () => { emitClusterStatsDrillDown('memory'); navigate(ROUTES.COMPUTE) },
        isClickable: hasData }
    case 'storage':
      return {
        value: hasData ? formatMemoryStat(stats.totalStorageGB) : '-',
        sublabel: 'storage',
        onClick: () => { emitClusterStatsDrillDown('storage'); navigate(ROUTES.STORAGE) },
        isClickable: hasData }
    case 'gpus':
      return {
        value: hasData ? stats.totalGPUs : '-',
        sublabel: 'total GPUs',
        onClick: () => { emitClusterStatsDrillDown('gpu'); openGPUModal() },
        isClickable: hasData && stats.totalGPUs > 0 }
    case 'pods':
      return {
        value: hasData ? stats.totalPods : '-',
        // The clusters summary only knows each cluster's total pod count
        // (backend ClusterHealth.PodCount counts every phase). Do NOT attest
        // running/pending/crashloop here — those markers previously mirrored
        // the total (and hardcoded zeros), which broke the live groundtruth
        // canary once a monitored cluster had non-running pods. Phase
        // breakdowns are attested by the pods page, which has real per-pod
        // data (usePodsView).
        groundtruthFields: {
          'pods-total': hasData ? stats.totalPods : '-',
        },
        sublabel: 'total pods',
        onClick: () => { emitClusterStatsDrillDown('pods'); navigate(ROUTES.WORKLOADS) },
        isClickable: hasData }
    default:
      return { value: '-', sublabel: '' }
  }
}
