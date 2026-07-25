import { useMemo } from 'react'

interface GPUNode {
  name: string
  gpuType: string
  gpuCount: number
  gpuAllocated: number
}

export function useGPUDetailData(nodes: GPUNode[]) {
  const gpuTypeBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; allocated: number }>()
    for (const node of nodes) {
      const key = node.gpuType
      if (!map.has(key)) {
        map.set(key, { total: 0, allocated: 0 })
      }
      const current = map.get(key)!
      current.total += node.gpuCount
      current.allocated += node.gpuAllocated
    }
    return Array.from(map.entries()).map(([type, data]) => ({
      type,
      ...data,
      available: data.total - data.allocated,
    }))
  }, [nodes])

  const clusterStats = useMemo(() => {
    let totalGPUs = 0
    let allocatedGPUs = 0
    for (const node of nodes) {
      totalGPUs += node.gpuCount
      allocatedGPUs += node.gpuAllocated
    }
    const utilizationPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0
    return {
      totalGPUs,
      allocatedGPUs,
      availableGPUs: totalGPUs - allocatedGPUs,
      utilizationPercent,
    }
  }, [nodes])

  return {
    gpuTypeBreakdown,
    clusterStats,
  }
}
