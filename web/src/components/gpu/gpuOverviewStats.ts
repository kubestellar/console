import { getChartColor } from '../../lib/chartColors'
import type { GPUReservation } from '../../hooks/useGPUReservations'
import type { GPUNode, ResourceQuota } from '../../hooks/mcp/types'
import { GPU_KEYS, MAX_NAME_DISPLAY_LENGTH } from './gpu-constants'

const CHART_COLOR_COUNT = 4
const PERCENT_SCALE = 100
const ELLIPSIS = '...'
const RESERVATION_STATUSES_COUNTING_TOWARD_CAPACITY = new Set<GPUReservation['status']>(['active'])

export interface GPUClusterSummary {
  name: string
  totalGPUs: number
  allocatedGPUs: number
}

export interface GPUOverviewStats {
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  utilizationPercent: number
  activeReservations: number
  reservedGPUs: number
  typeChartData: Array<{ name: string; value: number; color: string }>
  usageByNamespace: Array<{ name: string; value: number; color: string }>
  clusterUsage: Array<{ name: string; value: number }>
}

export function computeGPUOverviewStats({
  nodes,
  reservations,
  gpuQuotas,
  gpuClusters,
}: {
  nodes: GPUNode[]
  reservations: GPUReservation[]
  gpuQuotas: ResourceQuota[]
  gpuClusters: GPUClusterSummary[]
}): GPUOverviewStats {
  const totalGPUs = (nodes || []).reduce((sum, node) => sum + (node.gpuCount || 0), 0)
  const allocatedGPUs = Math.min(
    (nodes || []).reduce((sum, node) => sum + Math.max(node.gpuAllocated || 0, 0), 0),
    totalGPUs,
  )
  const availableGPUs = Math.max(totalGPUs - allocatedGPUs, 0)
  const utilizationPercent = totalGPUs > 0
    ? Math.round((allocatedGPUs / totalGPUs) * PERCENT_SCALE)
    : 0

  const reservableReservations = (reservations || []).filter(reservation =>
    RESERVATION_STATUSES_COUNTING_TOWARD_CAPACITY.has(reservation.status),
  )
  const requestedReservedGPUs = reservableReservations.reduce(
    (sum, reservation) => sum + Math.max(reservation.gpu_count || 0, 0),
    0,
  )
  const activeReservations = totalGPUs > 0 ? reservableReservations.length : 0
  const reservedGPUs = totalGPUs > 0 ? Math.min(requestedReservedGPUs, totalGPUs) : 0

  const gpuTypes = (nodes || []).reduce((acc, node) => {
    const gpuType = node.gpuType || 'Unknown'
    if (!acc[gpuType]) acc[gpuType] = { total: 0, allocated: 0 }
    acc[gpuType].total += node.gpuCount || 0
    acc[gpuType].allocated += Math.max(node.gpuAllocated || 0, 0)
    return acc
  }, {} as Record<string, { total: number; allocated: number }>)

  const typeChartData = Object.entries(gpuTypes).map(([name, data], index) => ({
    name,
    value: data.total,
    color: getChartColor((index % CHART_COLOR_COUNT) + 1),
  }))

  const namespaceUsage: Record<string, number> = {}
  for (const quota of (gpuQuotas || [])) {
    const label = quota.cluster ? `${quota.namespace} (${quota.cluster})` : quota.namespace
    for (const [key, value] of Object.entries(quota.used || {})) {
      if (GPU_KEYS.some(gpuKey => key.includes(gpuKey))) {
        namespaceUsage[label] = (namespaceUsage[label] || 0) + (parseInt(value, 10) || 0)
      }
    }
  }

  const usageByNamespace = Object.entries(namespaceUsage).map(([name, value], index) => ({
    name,
    value,
    color: getChartColor((index % CHART_COLOR_COUNT) + 1),
  }))

  const clusterUsage = (gpuClusters || []).map(cluster => ({
    name: cluster.name.length > MAX_NAME_DISPLAY_LENGTH
      ? `${cluster.name.slice(0, MAX_NAME_DISPLAY_LENGTH)}${ELLIPSIS}`
      : cluster.name,
    value: Math.min(Math.max(cluster.allocatedGPUs || 0, 0), Math.max(cluster.totalGPUs || 0, 0)),
  }))

  return {
    totalGPUs,
    allocatedGPUs,
    availableGPUs,
    utilizationPercent,
    activeReservations,
    reservedGPUs,
    typeChartData,
    usageByNamespace,
    clusterUsage,
  }
}
