/**
 * Manages the shared node cache subscription/fetch lifecycle for
 * ConsoleOfflineDetectionCard. Extracted so the main component only
 * has to consume the resulting state.
 */
import { useEffect, useState } from 'react'
import type { NodeData } from './offlineDataTransforms'
import { getNodesCache, subscribeToNodes, fetchAllNodes } from './nodeCache'
import { POLL_INTERVAL_MS } from '../../../lib/constants/network'

export interface UseOfflineNodesDataResult {
  allNodes: NodeData[]
  nodesLoading: boolean
  nodesRefreshing: boolean
  nodesFailures: number
}

export function useOfflineNodesData(shouldUseDemoData: boolean): UseOfflineNodesDataResult {
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => getNodesCache())
  const [nodesLoading, setNodesLoading] = useState(() => !shouldUseDemoData && getNodesCache().length === 0)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [nodesFailures, setNodesFailures] = useState(0)

  // Subscribe to cache updates and fetch nodes
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

  return { allNodes, nodesLoading, nodesRefreshing, nodesFailures }
}
