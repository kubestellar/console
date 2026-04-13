/**
 * AlertsDataFetcher — lazy-loaded bridge that calls MCP hooks and pushes
 * data into AlertsContext.  Keeping the MCP imports here (instead of in
 * AlertsContext.tsx) prevents the 300 KB MCP hook tree from being bundled
 * into the main chunk.  This component renders nothing visible.
 */

import { useEffect, useRef } from 'react'
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

  // Use ref to prevent infinite loop: onData triggers parent re-render which
  // re-renders this component with new array references from hooks
  const prevRef = useRef<string>('')
  useEffect(() => {
    const isLoading = isGPULoading || isPodIssuesLoading || isClustersLoading
    const errors = [gpuError, podIssuesError, clustersError].filter(Boolean)
    const errorStr = errors.length > 0 ? (errors || []).join('; ') : null
    // Fingerprint to skip no-op updates — include content hash so data changes
    // that don't alter array length still trigger an update (#7329/#7339).
    const gpuHash = (gpuNodes || []).map(n => `${n.cluster}:${n.gpuCount}:${n.gpuAllocated}`).join(',')
    const podHash = (podIssues || []).map(p => `${p.name}:${p.cluster}:${p.namespace}:${p.restarts}:${p.status}`).join(',')
    const clusterHash = (clusters || []).map(c => `${c.name}:${c.healthy}:${c.nodeCount}`).join(',')
    const fp = `${gpuHash}|${podHash}|${clusterHash}|${isLoading}|${errorStr}`
    if (fp === prevRef.current) return
    prevRef.current = fp
    onData({
      gpuNodes: gpuNodes || [],
      podIssues: podIssues || [],
      clusters: clusters || [],
      isLoading,
      error: errorStr,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps — onData is stable (useState setter)
  }, [gpuNodes, podIssues, clusters, isGPULoading, isPodIssuesLoading, isClustersLoading, gpuError, podIssuesError, clustersError])

  return null
}
