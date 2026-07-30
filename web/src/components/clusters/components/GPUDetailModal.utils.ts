import type { GPUNode } from '../../../hooks/useMCP'

export const GPU_UTIL_HIGH = 90
export const GPU_UTIL_WARN = 70

export interface GPUTypeInfo {
  type: string
  manufacturer: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  clusters: string[]
}

export interface ClusterGPUInfo {
  cluster: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  gpuTypes: string[]
}

export function extractManufacturer(gpuType: string): string {
  const lower = gpuType.toLowerCase()
  if (lower.includes('nvidia')) return 'NVIDIA'
  if (lower.includes('amd') || lower.includes('radeon')) return 'AMD'
  if (lower.includes('intel')) return 'Intel'
  return 'Unknown'
}

export function getUtilizationColor(percentage: number): string {
  if (percentage >= GPU_UTIL_HIGH) return 'text-red-400'
  if (percentage >= GPU_UTIL_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

export function buildGpuTypeInfo(gpuNodes: GPUNode[]): GPUTypeInfo[] {
  const typeMap = new Map<string, GPUTypeInfo>()
  gpuNodes.forEach(node => {
    const existing = typeMap.get(node.gpuType)
    if (existing) {
      existing.totalGPUs += node.gpuCount
      existing.allocatedGPUs += node.gpuAllocated
      existing.availableGPUs += (node.gpuCount - node.gpuAllocated)
      existing.nodeCount += 1
      if (!existing.clusters.includes(node.cluster)) {
        existing.clusters.push(node.cluster)
      }
    } else {
      typeMap.set(node.gpuType, {
        type: node.gpuType,
        manufacturer: extractManufacturer(node.gpuType),
        totalGPUs: node.gpuCount,
        allocatedGPUs: node.gpuAllocated,
        availableGPUs: node.gpuCount - node.gpuAllocated,
        nodeCount: 1,
        clusters: [node.cluster],
      })
    }
  })
  return Array.from(typeMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
}

export function buildClusterInfo(gpuNodes: GPUNode[]): ClusterGPUInfo[] {
  const clusterMap = new Map<string, ClusterGPUInfo>()
  gpuNodes.forEach(node => {
    const existing = clusterMap.get(node.cluster)
    if (existing) {
      existing.totalGPUs += node.gpuCount
      existing.allocatedGPUs += node.gpuAllocated
      existing.availableGPUs += (node.gpuCount - node.gpuAllocated)
      existing.nodeCount += 1
      if (!existing.gpuTypes.includes(node.gpuType)) {
        existing.gpuTypes.push(node.gpuType)
      }
    } else {
      clusterMap.set(node.cluster, {
        cluster: node.cluster,
        totalGPUs: node.gpuCount,
        allocatedGPUs: node.gpuAllocated,
        availableGPUs: node.gpuCount - node.gpuAllocated,
        nodeCount: 1,
        gpuTypes: [node.gpuType],
      })
    }
  })
  return Array.from(clusterMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
}
