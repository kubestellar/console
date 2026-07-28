import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle,
  Cpu,
  HardDrive,
  Layers,
  Rocket,
  Server,
  Settings as SettingsIcon,
  Ship,
  XCircle,
  Zap,
} from 'lucide-react'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'
import type {
  StatusBadgeConfig,
  SummaryItem,
  SummaryStats,
  ViewConfig,
} from './types'
import { HEALTHY_STATUSES } from './types'

export function getViewConfig(viewType: DrillDownViewType): ViewConfig {
  switch (viewType) {
    case 'all-clusters':
      return {
        icon: Server,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'clusters',
        nameKey: 'name',
        getStatus: (item: { healthy?: boolean; status?: string }) =>
          item.healthy ? 'healthy' : (item.status || 'unknown'),
      }
    case 'all-namespaces':
      return {
        icon: Layers,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'namespaces',
        nameKey: 'namespace',
        getStatus: () => 'active',
      }
    case 'all-deployments':
      return {
        icon: Rocket,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'deployments',
        nameKey: 'name',
        getStatus: (item: { readyReplicas?: number; replicas?: number }) =>
          item.readyReplicas === item.replicas ? 'healthy' : 'unhealthy',
      }
    case 'all-pods':
      return {
        icon: Box,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/20',
        dataKey: 'pods',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) =>
          item.status || item.phase || 'unknown',
      }
    case 'all-services':
      return {
        icon: Activity,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'services',
        nameKey: 'name',
        getStatus: () => 'active',
      }
    case 'all-nodes':
      return {
        icon: Server,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        dataKey: 'nodes',
        nameKey: 'name',
        getStatus: (item: { status?: string; ready?: boolean }) =>
          item.ready !== false && item.status !== 'NotReady' ? 'Ready' : 'NotReady',
      }
    case 'all-events':
      return {
        icon: Zap,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'events',
        nameKey: 'reason',
        getStatus: (item: { type?: string }) => item.type || 'Normal',
      }
    case 'all-alerts':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'alerts',
        nameKey: 'name',
        getStatus: (item: { status?: string; severity?: string; state?: string }) =>
          item.status || item.severity || item.state || 'unknown',
      }
    case 'all-helm':
      return {
        icon: Ship,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        dataKey: 'helmReleases',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown',
      }
    case 'all-operators':
      return {
        icon: SettingsIcon,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'operators',
        nameKey: 'name',
        getStatus: (item: { state?: string; phase?: string }) => item.state || item.phase || 'unknown',
      }
    case 'all-security':
      return {
        icon: AlertTriangle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        dataKey: 'securityIssues',
        nameKey: 'pod',
        getStatus: (item: { severity?: string; type?: string }) => item.severity || item.type || 'warning',
      }
    case 'all-gpu':
      return {
        icon: Cpu,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        dataKey: 'gpuNodes',
        nameKey: 'name',
        getStatus: (item: { available?: number }) =>
          item.available && item.available > 0 ? 'available' : 'busy',
      }
    case 'all-storage':
      return {
        icon: HardDrive,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        dataKey: 'pvcs',
        nameKey: 'name',
        getStatus: (item: { status?: string; phase?: string }) => item.status || item.phase || 'unknown',
      }
    case 'all-jobs':
      return {
        icon: Activity,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        dataKey: 'jobs',
        nameKey: 'name',
        getStatus: (item: { status?: string }) => item.status || 'unknown',
      }
    default:
      return {
        icon: Layers,
        color: 'text-muted-foreground',
        bgColor: 'bg-secondary',
        dataKey: 'items',
        nameKey: 'name',
        getStatus: () => 'unknown',
      }
  }
}

export function getStatusBadge(status: string): StatusBadgeConfig {
  const lower = status?.toLowerCase() || ''
  if (HEALTHY_STATUSES.includes(lower)) {
    return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' }
  }
  if (['pending', 'progressing', 'waiting', 'busy', 'warning'].includes(lower)) {
    return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
  }
  if (['failed', 'error', 'unhealthy', 'notready', 'critical', 'crashloopbackoff', 'imagepullbackoff'].includes(lower)) {
    return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' }
  }
  return { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-secondary' }
}

export function computeSummaryStats(
  filteredItems: SummaryItem[],
  getStatus: (item: SummaryItem) => string,
  opts: {
    searchQuery: string
    statusFilter: string
    clusterFilter: string
    viewType: DrillDownViewType
    expectedNodeCountFromClusters: number
    expectedPodCountFromClusters: number
  },
): SummaryStats {
  const listTotal = filteredItems.length
  const healthy = filteredItems.filter((item) => HEALTHY_STATUSES.includes(getStatus(item)?.toLowerCase() || '')).length
  const firing = filteredItems.filter((item) => getStatus(item)?.toLowerCase() === 'firing').length
  const resolved = filteredItems.filter((item) => getStatus(item)?.toLowerCase() === 'resolved').length

  let total = listTotal
  if (listTotal === 0 && !opts.searchQuery && opts.statusFilter === 'all' && opts.clusterFilter === 'all') {
    if (opts.viewType === 'all-nodes' && opts.expectedNodeCountFromClusters > 0) {
      total = opts.expectedNodeCountFromClusters
    } else if (opts.viewType === 'all-pods' && opts.expectedPodCountFromClusters > 0) {
      total = opts.expectedPodCountFromClusters
    }
  }

  return { total, healthy, issues: total - healthy, firing, resolved }
}
