/**
 * AlertsDataFetcher — lazy-loaded bridge that calls MCP hooks and pushes
 * data into AlertsContext.  Keeping the MCP imports here (instead of in
 * AlertsContext.tsx) prevents the 300 KB MCP hook tree from being bundled
 * into the main chunk.  This component renders nothing visible.
 */

import { useEffect } from 'react'
import { useGPUNodes, usePodIssues, useClusters } from '../hooks/useMCP'

export interface AlertsMCPData {
  gpuNodes: ReturnType<typeof useGPUNodes>['nodes']
  podIssues: ReturnType<typeof usePodIssues>['issues']
  clusters: ReturnType<typeof useClusters>['deduplicatedClusters']
  isLoading: boolean
  error: string | null
}

interface Props {
  onData: (data: AlertsMCPData) => void
}

export default function AlertsDataFetcher({ onData }: Props) {
  const { nodes: gpuNodes, isLoading: isGPULoading, error: gpuError } = useGPUNodes()
  const { issues: podIssues, isLoading: isPodIssuesLoading, error: podIssuesError } = usePodIssues()
  const { deduplicatedClusters: clusters, isLoading: isClustersLoading, error: clustersError } = useClusters()

  useEffect(() => {
    const errors = [gpuError, podIssuesError, clustersError].filter(Boolean)
    onData({
      gpuNodes: gpuNodes || [],
      podIssues: podIssues || [],
      clusters: clusters || [],
      isLoading: isGPULoading || isPodIssuesLoading || isClustersLoading,
      error: errors.length > 0 ? (errors || []).join('; ') : null,
    })
  }, [gpuNodes, podIssues, clusters, isGPULoading, isPodIssuesLoading, isClustersLoading, gpuError, podIssuesError, clustersError, onData])

  return null
}
