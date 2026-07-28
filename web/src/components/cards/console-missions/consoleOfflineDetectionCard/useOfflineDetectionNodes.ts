import { useEffect, useMemo, useState } from 'react'
import { POLL_INTERVAL_MS } from '../../../../lib/constants/network'
import type { NodeData } from '../offlineDataTransforms'
import { fetchAllNodes, getNodesCache, subscribeToNodes } from '../nodeCache'

interface UseOfflineDetectionNodesParams {
  shouldUseDemoData: boolean
  isAllClustersSelected: boolean
  selectedClusters: string[]
  customFilter: string
}

export function useOfflineDetectionNodes({
  shouldUseDemoData,
  isAllClustersSelected,
  selectedClusters,
  customFilter,
}: UseOfflineDetectionNodesParams) {
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => getNodesCache())
  const [nodesLoading, setNodesLoading] = useState(() => !shouldUseDemoData && getNodesCache().length === 0)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [nodesFailures, setNodesFailures] = useState(0)

  useEffect(() => {
    if (shouldUseDemoData) {
      return
    }

    let isMounted = true
    const handleUpdate = (nodes: NodeData[]) => {
      if (!isMounted) return
      setAllNodes(nodes)
      setNodesLoading(false)
    }
    const unsubscribe = subscribeToNodes(handleUpdate)

    const refreshNodes = () => {
      if (!isMounted) return
      setNodesRefreshing(getNodesCache().length > 0)

      fetchAllNodes().then(result => {
        if (!isMounted) return
        setAllNodes(result.nodes)
        setNodesLoading(false)
        setNodesRefreshing(false)
        setNodesFailures(result.consecutiveFailures)
      }).catch(() => {
        if (!isMounted) return
        setNodesRefreshing(false)
      })
    }

    refreshNodes()
    const interval = setInterval(refreshNodes, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      unsubscribe()
      clearInterval(interval)
    }
  }, [shouldUseDemoData])

  const nodes = useMemo(() => {
    let result = allNodes

    if (!isAllClustersSelected) {
      result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        (n.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allNodes, isAllClustersSelected, selectedClusters, customFilter])

  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(n =>
      n.status !== 'Ready' || n.unschedulable === true
    )
    const byName = new Map<string, typeof unhealthy[0]>()
    unhealthy.forEach(n => {
      const existing = byName.get(n.name)
      if (!existing || (n.cluster?.length || 999) < (existing.cluster?.length || 999)) {
        byName.set(n.name, n)
      }
    })
    return Array.from(byName.values())
  }, [nodes])

  return {
    allNodes,
    nodesLoading,
    nodesRefreshing,
    nodesFailures,
    offlineNodes,
  }
}
