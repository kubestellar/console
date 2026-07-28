import type { GPUNode } from '../../../hooks/useMCP'

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

export interface GPUTotals {
  total: number
  allocated: number
  available: number
  utilizationPercent: number
}

export interface GPUSpecs {
  totalMemoryGB: number
  families: string[]
  cudaDriverVersions: string[]
  cudaRuntimeVersions: string[]
  migCapableCount: number
}

/** GPU utilization % threshold for critical (red) status. */
export const GPU_UTIL_HIGH = 90
/** GPU utilization % threshold for warning (yellow) status. */
export const GPU_UTIL_WARN = 70

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

/**
 * Calculates the GPU type breakdown (total/allocated/available GPUs per
 * GPU type, across clusters). Extracted from GPUDetailModal.tsx (#21613)
 * as a pure function to reduce the component's line count.
 */
export function computeGpuTypeInfo(gpuNodes: GPUNode[]): GPUTypeInfo[] {
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
        clusters: [node.cluster] })
    }
  })

  return Array.from(typeMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
}

/**
 * Calculates the per-cluster GPU breakdown. Extracted from
 * GPUDetailModal.tsx (#21613) as a pure function.
 */
export function computeClusterInfo(gpuNodes: GPUNode[]): ClusterGPUInfo[] {
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
        gpuTypes: [node.gpuType] })
    }
  })

  return Array.from(clusterMap.values()).sort((a, b) => b.totalGPUs - a.totalGPUs)
}

/** Calculates aggregate total/allocated/available/utilization across all GPU nodes. */
export function computeGpuTotals(gpuNodes: GPUNode[]): GPUTotals {
  let total = 0
  let allocated = 0
  gpuNodes.forEach(node => {
    total += node.gpuCount
    allocated += node.gpuAllocated
  })
  return {
    total,
    allocated,
    available: total - allocated,
    utilizationPercent: total > 0 ? Math.round((allocated / total) * 100) : 0 }
}

/** Aggregates total GPU count by manufacturer, sorted descending. */
export function computeManufacturerBreakdown(gpuTypeInfo: GPUTypeInfo[]): Array<[string, number]> {
  const mfgMap = new Map<string, number>()
  gpuTypeInfo.forEach(info => {
    const existing = mfgMap.get(info.manufacturer) || 0
    mfgMap.set(info.manufacturer, existing + info.totalGPUs)
  })
  return Array.from(mfgMap.entries()).sort((a, b) => b[1] - a[1])
}

const MB_PER_GB = 1024

/** Extracts GPU specifications (VRAM, family, CUDA versions, MIG support) from nodes. */
export function computeGpuSpecs(gpuNodes: GPUNode[]): GPUSpecs {
  const specs = {
    totalMemoryGB: 0,
    families: new Set<string>(),
    cudaDriverVersions: new Set<string>(),
    cudaRuntimeVersions: new Set<string>(),
    migCapableCount: 0 }

  gpuNodes.forEach(node => {
    if (node.gpuMemoryMB) {
      specs.totalMemoryGB += (node.gpuMemoryMB / MB_PER_GB) * node.gpuCount
    }
    if (node.gpuFamily) {
      specs.families.add(node.gpuFamily)
    }
    if (node.cudaDriverVersion) {
      specs.cudaDriverVersions.add(node.cudaDriverVersion)
    }
    if (node.cudaRuntimeVersion) {
      specs.cudaRuntimeVersions.add(node.cudaRuntimeVersion)
    }
    if (node.migCapable) {
      specs.migCapableCount += node.gpuCount
    }
  })

  return {
    totalMemoryGB: Math.round(specs.totalMemoryGB),
    families: Array.from(specs.families),
    cudaDriverVersions: Array.from(specs.cudaDriverVersions),
    cudaRuntimeVersions: Array.from(specs.cudaRuntimeVersions),
    migCapableCount: specs.migCapableCount }
}
