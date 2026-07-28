import { useMemo } from 'react'
import { useNamespaces } from '../../../hooks/useMCP'
import type { GPUNode } from '../../../hooks/useMCP'
import type { GPUClusterInfo } from '../ReservationFormModal'

interface UseReservationDataProps {
  cluster: string
  allNodes: GPUNode[]
  gpuClusters: GPUClusterInfo[]
  forceLive?: boolean
  knownNamespacesByCluster?: Record<string, string[]>
}

export function useReservationData({
  cluster,
  allNodes,
  gpuClusters,
  forceLive,
  knownNamespacesByCluster,
}: UseReservationDataProps) {
  const {
    namespaces: rawNamespaces,
    isLoading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespaces(cluster || undefined, forceLive)

  // Union the hook result with namespaces from existing reservations
  const mergedRawNamespaces = useMemo(() => {
    const knownForCluster = (cluster && knownNamespacesByCluster?.[cluster]) || []
    if (knownForCluster.length === 0) return rawNamespaces
    return Array.from(new Set<string>([...rawNamespaces, ...knownForCluster])).sort()
  }, [rawNamespaces, cluster, knownNamespacesByCluster])

  // Filter out system namespaces from the dropdown
  const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
  const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
  const clusterNamespaces = mergedRawNamespaces.filter(
    ns => !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) && !FILTERED_NS_EXACT.includes(ns),
  )

  // Get the selected cluster's GPU info
  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  // Auto-detect GPU resource key from cluster's GPU types
  const gpuResourceKey = useMemo(() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(
      n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'),
    )
    const hasIntel = clusterNodes.some(
      n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'),
    )
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  }, [cluster, allNodes])

  // GPU types available on selected cluster with per-type counts
  const clusterGPUTypes = useMemo(() => {
    if (!cluster) return [] as Array<{ type: string; total: number; available: number }>
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({
      type,
      total: d.total,
      available: d.total - d.allocated,
    }))
  }, [cluster, allNodes])

  return {
    clusterNamespaces,
    namespacesLoading,
    namespacesError,
    refetchNamespaces,
    selectedClusterInfo,
    maxGPUs,
    gpuResourceKey,
    clusterGPUTypes,
  }
}
