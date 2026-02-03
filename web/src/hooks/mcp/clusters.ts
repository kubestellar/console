import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../../lib/api'
import { useDemoMode, getDemoMode } from '../useDemoMode'
import { triggerAggressiveDetection } from '../useLocalAgent'
import type { ClusterHealth, MCPStatus } from './types'
import {
  REFRESH_INTERVAL_MS,
  CLUSTER_POLL_INTERVAL_MS,
  getEffectiveInterval,
  clusterCache,
  clusterSubscribers,
  connectSharedWebSocket,
  fullFetchClusters,
  initialFetchStarted,
  deduplicateClustersByServer,
  shareMetricsBetweenSameServerClusters,
  sharedWebSocket,
  fetchSingleClusterHealth,
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
  setInitialFetchStarted,
  setHealthCheckFailures,
} from './shared'
import type { ClusterCache } from './shared'

// Hook to get MCP status
export function useMCPStatus() {
  const [status, setStatus] = useState<MCPStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get<MCPStatus>('/api/mcp/status')
        setStatus(data)
        setError(null)
      } catch (err) {
        setError('MCP bridge not available')
        setStatus(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
    // Poll every 2 minutes
    const interval = setInterval(fetchStatus, getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [])

  return { status, isLoading, error }
}

export function useClusters() {
  // Local state that syncs with shared cache
  const [localState, setLocalState] = useState<ClusterCache>(clusterCache)
  // Track demo mode to re-fetch when it changes
  const { isDemoMode } = useDemoMode()

  // Subscribe to shared cache updates
  useEffect(() => {
    // Set initial state from cache
    setLocalState(clusterCache)

    // Subscribe to updates
    const handleUpdate = (cache: ClusterCache) => {
      setLocalState(cache)
    }
    clusterSubscribers.add(handleUpdate)

    return () => {
      clusterSubscribers.delete(handleUpdate)
    }
  }, [])

  // Re-fetch when demo mode changes (not on initial mount)
  const initialMountRef = useRef(true)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    // Reset fetch flag and failure tracking to allow re-fetching
    setInitialFetchStarted(false)
    setHealthCheckFailures(0)

    if (!isDemoMode) {
      // Switching FROM demo to live: aggressively detect the agent first
      // so isAgentUnavailable() returns false before data fetches run
      triggerAggressiveDetection().then(() => {
        fullFetchClusters()
      })
    } else {
      // Switching TO demo mode: fetch demo data directly
      fullFetchClusters()
    }
  }, [isDemoMode])

  // Trigger initial fetch only once (shared across all hook instances)
  useEffect(() => {
    if (!initialFetchStarted) {
      setInitialFetchStarted(true)
      fullFetchClusters()

      // Connect to WebSocket for real-time kubeconfig change notifications
      // Only attempt WebSocket on localhost (dev mode) - deployed versions don't have a backend
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (!isLocalhost) {
        return
      }

      // Don't attempt WebSocket if not authenticated
      const token = localStorage.getItem('token')
      if (!token) {
        return
      }

      // Use shared WebSocket connection to prevent multiple connections
      if (!sharedWebSocket.connecting && !sharedWebSocket.ws) {
        connectSharedWebSocket()
      }
    }
  }, [])

  // Poll cluster data periodically to keep dashboard fresh
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fullFetchClusters()
    }, getEffectiveInterval(CLUSTER_POLL_INTERVAL_MS))

    return () => {
      clearInterval(pollInterval)
    }
  }, [])

  // Refetch function that consumers can call
  const refetch = useCallback(() => {
    fullFetchClusters()
  }, [])

  // Deduplicated clusters (single cluster per server, with aliases)
  // Use this for metrics, stats, and counts to avoid double-counting
  const deduplicatedClusters = useMemo(() => {
    // First share metrics between clusters with same server (so short names get metrics from long names)
    const sharedMetricsClusters = shareMetricsBetweenSameServerClusters(localState.clusters)
    const result = deduplicateClustersByServer(sharedMetricsClusters)

    return result
  }, [localState.clusters])

  return {
    // Raw clusters - all contexts including duplicates pointing to same server
    clusters: localState.clusters,
    // Deduplicated clusters - single cluster per server with aliases
    // Use this for metrics, stats, and aggregations to avoid double-counting
    deduplicatedClusters,
    isLoading: localState.isLoading,
    isRefreshing: localState.isRefreshing,
    lastUpdated: localState.lastUpdated,
    error: localState.error,
    refetch,
    consecutiveFailures: localState.consecutiveFailures,
    isFailed: localState.isFailed,
    lastRefresh: localState.lastRefresh,
  }
}

// Hook to get cluster health - uses kubectl proxy for direct cluster access
// Preserves previous data during transient failures (stale-while-revalidate pattern)
export function useClusterHealth(cluster?: string) {
  // Use a ref to store previous good health data for stale-while-revalidate
  const prevHealthRef = useRef<ClusterHealth | null>(null)
  const [health, setHealth] = useState<ClusterHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset state when cluster changes to avoid showing stale data from previous cluster
  useEffect(() => {
    prevHealthRef.current = null
    setHealth(null)
    setIsLoading(true)
    setError(null)
  }, [cluster])

  // Try to get cached data from shared cluster cache on mount
  const getCachedHealth = useCallback((): ClusterHealth | null => {
    if (!cluster) return null
    const cached = clusterCache.clusters.find(c => c.name === cluster)
    if (cached && cached.nodeCount !== undefined) {
      return {
        cluster: cached.name,
        healthy: cached.healthy ?? false,
        reachable: cached.reachable ?? true,
        nodeCount: cached.nodeCount ?? 0,
        readyNodes: cached.nodeCount ?? 0,
        podCount: cached.podCount ?? 0,
        cpuCores: cached.cpuCores,
        memoryGB: cached.memoryGB,
        storageGB: cached.storageGB,
      }
    }
    return null
  }, [cluster])

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoHealth = getDemoHealth(cluster)
      prevHealthRef.current = demoHealth
      setHealth(demoHealth)
      setIsLoading(false)
      setError(null)
      return
    }

    if (!cluster) {
      setIsLoading(false)
      return
    }

    // Set loading but keep displaying previous data (stale-while-revalidate)
    setIsLoading(true)

    try {
      // Look up the cluster's context for kubectl commands
      const clusterInfo = clusterCache.clusters.find(c => c.name === cluster)
      const kubectlContext = clusterInfo?.context

      // Use fetchSingleClusterHealth which tries kubectl proxy first, then falls back to API
      const data = await fetchSingleClusterHealth(cluster, kubectlContext)
      if (data) {
        if (data.reachable !== false) {
          // Success - clear failure tracking and update health
          clearClusterFailure(cluster)
          prevHealthRef.current = data
          setHealth(data)
          setError(null)
        } else {
          // Cluster reported as unreachable - track failure start time
          recordClusterFailure(cluster)

          if (shouldMarkOffline(cluster)) {
            // 5+ minutes of failures - show unreachable status
            setHealth(data)
            setError(null)
          } else {
            // Transient failure - keep showing previous good data if available
            if (prevHealthRef.current) {
              setHealth(prevHealthRef.current)
            } else {
              // No previous data - use cached data from shared cache if available
              const cached = getCachedHealth()
              if (cached) {
                setHealth(cached)
              } else {
                setHealth(data) // Fall back to showing unreachable
              }
            }
            setError(null)
          }
        }
      } else {
        // No health data available - track failure start time
        recordClusterFailure(cluster)

        if (shouldMarkOffline(cluster)) {
          // 5+ minutes of failures - mark as unreachable
          setHealth({
            cluster,
            healthy: false,
            reachable: false,
            nodeCount: 0,
            readyNodes: 0,
            podCount: 0,
            errorMessage: 'Unable to connect after 5 minutes',
          })
        } else {
          // Transient failure - keep showing previous good data
          if (prevHealthRef.current) {
            setHealth(prevHealthRef.current)
          } else {
            const cached = getCachedHealth()
            if (cached) {
              setHealth(cached)
            }
            // If no cached data, keep current state (might be null on first load)
          }
        }
        setError(null)
      }
    } catch (err) {
      // Exception - track failure start time
      recordClusterFailure(cluster)

      if (shouldMarkOffline(cluster)) {
        setError('Failed to fetch cluster health')
        setHealth(getDemoHealth(cluster))
      } else {
        // Keep previous data on transient error
        if (prevHealthRef.current) {
          setHealth(prevHealthRef.current)
        }
        setError(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [cluster, getCachedHealth])

  useEffect(() => {
    // Try to initialize with cached data immediately
    const cached = getCachedHealth()
    if (cached) {
      prevHealthRef.current = cached
      setHealth(cached)
      setIsLoading(false)
    }
    // Then fetch fresh data
    refetch()
  }, [refetch, getCachedHealth])

  return { health, isLoading, error, refetch }
}

function getDemoHealth(cluster?: string): ClusterHealth {
  // Return cluster-specific demo health data
  const clusterMetrics: Record<string, { nodeCount: number; podCount: number; cpuCores: number; memoryGB: number; storageGB: number }> = {
    'kind-local': { nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50 },
    'minikube': { nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20 },
    'k3s-edge': { nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100 },
    'eks-prod-us-east-1': { nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000 },
    'gke-staging': { nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000 },
    'aks-dev-westeu': { nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500 },
    'openshift-prod': { nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500 },
    'oci-oke-phoenix': { nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800 },
    'alibaba-ack-shanghai': { nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200 },
    'do-nyc1-prod': { nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300 },
    'rancher-mgmt': { nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400 },
    'vllm-gpu-cluster': { nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000 },
  }
  const metrics = clusterMetrics[cluster || ''] || { nodeCount: 3, podCount: 45, cpuCores: 24, memoryGB: 96, storageGB: 500 }
  // Calculate used/requested resources (simulate 40-75% utilization)
  const utilizationFactor = 0.4 + Math.random() * 0.35
  return {
    cluster: cluster || 'default',
    healthy: cluster !== 'alibaba-ack-shanghai',
    nodeCount: metrics.nodeCount,
    readyNodes: metrics.nodeCount,
    podCount: metrics.podCount,
    cpuCores: metrics.cpuCores,
    memoryGB: metrics.memoryGB,
    memoryBytes: metrics.memoryGB * 1024 * 1024 * 1024,
    storageGB: metrics.storageGB,
    storageBytes: metrics.storageGB * 1024 * 1024 * 1024,
    cpuRequestsCores: Math.round(metrics.cpuCores * utilizationFactor * 10) / 10,
    memoryRequestsGB: Math.round(metrics.memoryGB * utilizationFactor * 10) / 10,
    issues: [],
  }
}
