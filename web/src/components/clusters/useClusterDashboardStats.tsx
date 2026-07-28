import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
import { ROUTES } from '../../config/routes'
import { formatMemoryStat } from '../../lib/formatStats'
import { StatusBadge } from '../ui/StatusBadge'
import type { StatBlockValue } from '../ui/StatsOverview'
import type { ClusterStats } from './useClusterStats'
import type { ClusterFilterValue } from './useClusterPageState'

const MIN_CLUSTER_PROGRESS_TOTAL = 1

export interface UseClusterDashboardStatsArgs {
  stats: ClusterStats
  setFilter: (filter: ClusterFilterValue) => void
  setShowClusterGrid: (show: boolean) => void
  openGPUModal: () => void
}

export interface ClusterDashboardStats {
  /** Small badge shown next to the page title summarising cluster health */
  headerBadge: ReactNode
  /** Value getter passed to DashboardPage's configurable StatsOverview */
  getStatValue: (blockId: string) => StatBlockValue
  /** Screen-reader-only groundtruth fields rendered above the stats */
  clusterGroundtruthFields: Record<string, number>
}

/**
 * Computes the header badge, per-stat click/value config, and groundtruth
 * fields for the Clusters page's StatsOverview. Extracted from Clusters.tsx
 * to keep the page component focused on rendering (#21617).
 */
export function useClusterDashboardStats({ stats, setFilter, setShowClusterGrid, openGPUModal }: UseClusterDashboardStatsArgs): ClusterDashboardStats {
  const navigate = useNavigate()

  const headerBadge = (() => {
    if (stats.unreachable > 0) {
      return (
        <StatusBadge color="red" size="xs" variant="outline" icon={<AlertCircle className="w-3 h-3" />}>
          {`${stats.unreachable} offline cluster${stats.unreachable === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }

    if (stats.unhealthy > 0) {
      return (
        <StatusBadge color="yellow" size="xs" variant="outline" icon={<AlertTriangle className="w-3 h-3" />}>
          {`${stats.unhealthy} degraded cluster${stats.unhealthy === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }

    return (
      <StatusBadge color="green" size="xs" variant="outline" icon={<CheckCircle className="w-3 h-3" />}>
        All clusters healthy
      </StatusBadge>
    )
  })()

  const clusterStatusProgressMax = Math.max(stats.total, MIN_CLUSTER_PROGRESS_TOTAL)

  const getStatValue = (blockId: string): StatBlockValue => {
    const hasData = stats.hasResourceData || stats.total > 0
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
          groundtruthFields: {
            'pods-total': hasData ? stats.totalPods : '-',
            'pods-running': hasData ? stats.totalPods : '-',
            'pods-pending': 0,
            'pods-crashloop': 0,
          },
          sublabel: 'running pods',
          onClick: () => { emitClusterStatsDrillDown('pods'); navigate(ROUTES.WORKLOADS) },
          isClickable: hasData }
      default:
        return { value: '-', sublabel: '' }
    }
  }

  const clusterGroundtruthFields: Record<string, number> = {
    'clusters-total': stats.total,
    'clusters-healthy': stats.healthy,
    'clusters-unhealthy': stats.unhealthy,
    'clusters-unreachable': stats.unreachable,
    'nodes-total': stats.totalNodes,
    'nodes-ready': stats.healthyNodes,
    'pods-total': stats.totalPods,
    'pods-running': stats.totalPods,
    'pods-pending': 0,
    'pods-crashloop': 0,
  }

  return { headerBadge, getStatValue, clusterGroundtruthFields }
}
