import { useEffect, useRef, useState } from 'react'
import type { ClusterInfo } from './mcp/types'
import {
  clearCachedVersions,
  createVersionWsHandle,
  VERSION_CACHE_TTL,
  type VersionWsHandle,
  type VersionWsMessage,
} from './useUpgradeWebSocket'
import { getDemoVersionForCluster } from '../components/cards/upgradeHelpers'

const RETRY_INTERVAL_MS = 15000

interface UpgradeVersionState {
  clusterVersions: Record<string, string>
  fetchCompleted: boolean
}

interface UseUpgradeStateMachineParams {
  allClusters: ClusterInfo[]
  agentConnected: boolean
  isDemoMode: boolean
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent) => VersionWsMessage | null
}

interface UseUpgradeStateMachineResult {
  clusterVersions: Record<string, string>
  fetchCompleted: boolean
}

export function useUpgradeStateMachine({
  allClusters,
  agentConnected,
  isDemoMode,
  openTrackedWs,
  parseWsMessage,
}: UseUpgradeStateMachineParams): UseUpgradeStateMachineResult {
  const [{ clusterVersions, fetchCompleted }, setVersionState] = useState<UpgradeVersionState>({
    clusterVersions: {},
    fetchCompleted: false,
  })

  // Managed WebSocket handle — created once per mount, destroyed on unmount
  const wsHandleRef = useRef<VersionWsHandle | null>(null)
  if (!wsHandleRef.current) {
    wsHandleRef.current = createVersionWsHandle(openTrackedWs, parseWsMessage)
  }

  // Destroy WebSocket and pending requests on unmount
  useEffect(() => {
    const handle = wsHandleRef.current
    return () => {
      handle?.destroy()
      wsHandleRef.current = null
    }
  }, [])

  // Track previous agent connection state to detect reconnections
  const prevAgentConnectedRef = useRef(agentConnected)

  // Use a ref to track which clusters we've already fetched successfully
  const fetchedClustersRef = useRef(new Set<string>())
  // Track clusters that failed to fetch for retry
  const failedClustersRef = useRef(new Set<string>())

  // Clear fetch cache when agent reconnects (was disconnected, now connected)
  useEffect(() => {
    if (agentConnected && !prevAgentConnectedRef.current) {
      // Agent just reconnected - clear the fetch cache to re-fetch all versions
      fetchedClustersRef.current.clear()
      failedClustersRef.current.clear()
    }
    prevAgentConnectedRef.current = agentConnected
  }, [agentConnected])

  // Populate demo versions when in demo mode
  const demoVersionsSetRef = useRef(false)
  useEffect(() => {
    if (!isDemoMode || (allClusters || []).length === 0) return
    if (demoVersionsSetRef.current) return
    demoVersionsSetRef.current = true

    const demoVersions: Record<string, string> = {}
    for (const cluster of (allClusters || [])) {
      demoVersions[cluster.name] = getDemoVersionForCluster(cluster.name)
    }

    setVersionState((prev) => ({
      ...prev,
      clusterVersions: demoVersions,
      fetchCompleted: true,
    }))
  }, [isDemoMode, allClusters])

  // Fetch real versions from clusters via local agent
  useEffect(() => {
    if (isDemoMode) return // Demo versions handled above

    if (!agentConnected || (allClusters || []).length === 0) {
      // If not connected, mark fetch as completed so we show '-' instead of 'loading...'
      // But preserve any cached versions we already have
      setVersionState((prev) => ({ ...prev, fetchCompleted: true }))
      return
    }

    let cancelled = false
    setVersionState((prev) => ({ ...prev, fetchCompleted: false }))

    const fetchVersions = async () => {
      // Only fetch for healthy/reachable clusters that we haven't cached yet
      const reachableClusters = (allClusters || []).filter(
        (cluster) => cluster.healthy !== false && cluster.nodeCount && cluster.nodeCount > 0,
      )

      // Determine which clusters need fetching (not cached, or previously failed)
      const clustersToFetch = reachableClusters.filter(
        (cluster) => !fetchedClustersRef.current.has(cluster.name) || failedClustersRef.current.has(cluster.name),
      )

      if (clustersToFetch.length === 0) {
        if (!cancelled) setVersionState((prev) => ({ ...prev, fetchCompleted: true }))
        return
      }

      // Fetch all clusters in parallel for faster loading
      const handle = wsHandleRef.current
      if (!handle) return

      const fetchPromises = clustersToFetch.map(async (cluster) => {
        const version = await handle.fetchClusterVersion(cluster.name)
        return { name: cluster.name, version }
      })

      const results = await Promise.all(fetchPromises)
      if (cancelled) return

      // Process results
      const newVersions: Record<string, string> = {}
      let hasNewData = false

      for (const { name, version } of results) {
        if (version) {
          newVersions[name] = version
          fetchedClustersRef.current.add(name)
          failedClustersRef.current.delete(name)
          hasNewData = true
        } else {
          // Track failed clusters for retry on next cycle
          failedClustersRef.current.add(name)
        }
      }

      // Merge new versions with existing, preserving cache
      setVersionState((prev) => ({
        ...prev,
        clusterVersions: hasNewData ? { ...prev.clusterVersions, ...newVersions } : prev.clusterVersions,
        fetchCompleted: true,
      }))
    }

    void fetchVersions()

    // Retry failed clusters every 15 seconds
    const retryInterval = setInterval(() => {
      if (failedClustersRef.current.size > 0 && agentConnected) {
        void fetchVersions()
      }
    }, RETRY_INTERVAL_MS)

    // #6292: re-fetch ALL clusters on VERSION_CACHE_TTL so a successfully
    // upgraded cluster reflects its new version. Without this loop,
    // `fetchedClustersRef` kept the old cluster in the "already fetched,
    // skip" set forever and the card showed the pre-upgrade version
    // until the user navigated away and came back. Also clears the
    // per-cluster version cache so `getCachedVersion()` re-fetches.
    const refreshInterval = setInterval(() => {
      if (!agentConnected) return
      fetchedClustersRef.current.clear()
      clearCachedVersions((allClusters || []).map((cluster) => cluster.name))
      void fetchVersions()
    }, VERSION_CACHE_TTL)

    return () => {
      cancelled = true
      clearInterval(retryInterval)
      clearInterval(refreshInterval)
    }
  }, [isDemoMode, agentConnected, allClusters])

  return { clusterVersions, fetchCompleted }
}
