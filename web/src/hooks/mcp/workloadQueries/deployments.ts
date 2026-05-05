import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { fetchSSE } from '../../../lib/sseClient'
import { registerRefetch } from '../../../lib/modeTransition'
import { isInClusterMode } from '../../useBackendHealth'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, clusterCacheRef, fetchWithRetry } from '../shared'
import { subscribePolling } from '../pollingManager'
import type { Deployment, DeploymentIssue } from '../types'
import { subscribeWorkloadsCache, type WorkloadsSharedState } from '../workloadSubscriptions'
import { fetchInClusterCollection, type UseDeploymentIssuesResult, type UseDeploymentsResult } from './shared'

export function getDemoDeploymentIssues(): DeploymentIssue[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      replicas: 3,
      readyReplicas: 1,
      reason: 'Unavailable',
      message: 'Deployment does not have minimum availability',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      replicas: 5,
      readyReplicas: 3,
      reason: 'Progressing',
      message: 'ReplicaSet is progressing',
    },
  ]
}

export function getDemoDeployments(): Deployment[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'running',
      replicas: 3,
      readyReplicas: 3,
      updatedReplicas: 3,
      availableReplicas: 3,
      progress: 100,
      image: 'api-gateway:v2.4.1',
      age: '5d',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'deploying',
      replicas: 3,
      readyReplicas: 2,
      updatedReplicas: 3,
      availableReplicas: 2,
      progress: 67,
      image: 'worker:v1.8.0',
      age: '2h',
    },
    {
      name: 'frontend',
      namespace: 'web',
      cluster: 'prod-west',
      status: 'failed',
      replicas: 3,
      readyReplicas: 1,
      updatedReplicas: 3,
      availableReplicas: 1,
      progress: 33,
      image: 'frontend:v3.0.0',
      age: '30m',
    },
    {
      name: 'cache-redis',
      namespace: 'data',
      cluster: 'staging',
      status: 'running',
      replicas: 1,
      readyReplicas: 1,
      updatedReplicas: 1,
      availableReplicas: 1,
      progress: 100,
      image: 'redis:7.2.0',
      age: '14d',
    },
  ]
}
// ---------------------------------------------------------------------------
// Module-level cache for deployment issues data (persists across navigation)
// ---------------------------------------------------------------------------

interface DeploymentIssuesCache {
  data: DeploymentIssue[]
  timestamp: Date
  key: string
}
let deploymentIssuesCache: DeploymentIssuesCache | null = null


export function resetDeploymentsCache() {
  deploymentIssuesCache = null
  deploymentsCache = null
}

// ---------------------------------------------------------------------------
// useDeploymentIssues
// ---------------------------------------------------------------------------

export function useDeploymentIssues(cluster?: string, namespace?: string): UseDeploymentIssuesResult {
  const cacheKey = `deploymentIssues:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (deploymentIssuesCache && deploymentIssuesCache.key === cacheKey) {
      return { data: deploymentIssuesCache.data, timestamp: deploymentIssuesCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [issues, setIssues] = useState<DeploymentIssue[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoIssues = getDemoDeploymentIssues().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIssues(demoIssues)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      // deployment-issues is a backend-only endpoint (#9996) — route SSE via /api/mcp/
      const allIssues = await fetchSSE<DeploymentIssue>({
        url: `/api/mcp/deployment-issues/stream`,
        params: sseParams,
        itemsKey: 'issues',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setIssues(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })

      const now = new Date()
      deploymentIssuesCache = { data: allIssues, timestamp: now, key: cacheKey }
      setIssues(allIssues)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentIssuesCache) {
        setError('Failed to fetch deployment issues')
      }
    } finally {
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for deployment issues (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `deploymentIssues:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`deploymentIssues:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
      sseAbortRef.current?.abort()
    }
  }, [refetch, cacheKey, consecutiveFailures])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setIssues([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

  return {
    issues,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// ---------------------------------------------------------------------------
// Module-level cache for deployments data (persists across navigation)
// ---------------------------------------------------------------------------

interface DeploymentsCache {
  data: Deployment[]
  timestamp: Date
  key: string
}
let deploymentsCache: DeploymentsCache | null = null

// ---------------------------------------------------------------------------
// useDeployments – Hook to get deployments with rollout status
// ---------------------------------------------------------------------------

export function useDeployments(cluster?: string, namespace?: string): UseDeploymentsResult {
  const cacheKey = `deployments:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available and matches current key
  const getCachedData = () => {
    if (deploymentsCache && deploymentsCache.key === cacheKey) {
      return { data: deploymentsCache.data, timestamp: deploymentsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [deployments, setDeployments] = useState<Deployment[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  // Track previous values to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  // Reset state only when cluster/namespace actually CHANGES (not on initial mount)
  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace

    if (clusterChanged || namespaceChanged) {
      setDeployments([])
      setIsLoading(true)
      setError(null)
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoDeployments = getDemoDeployments().filter(d =>
        (!cluster || d.cluster === cluster) && (!namespace || d.namespace === namespace)
      )
      setDeployments(demoDeployments)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      if (!deploymentsCache || deploymentsCache.key !== cacheKey) {
        // Also show loading if no cache
        setIsLoading(true)
      }
    }

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })

        if (response.ok) {
          const data = await response.json()
          const deployData = (data.deployments || []).map((d: Deployment) => ({ ...d, cluster: d.cluster || cluster }))
          const now = new Date()
          // Update cache
          deploymentsCache = { data: deployData, timestamp: now, key: cacheKey }
          setDeployments(deployData)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          if (!silent) {
            setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          } else {
            setIsRefreshing(false)
          }
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent unavailable — fall through to kubectl proxy
        console.debug('[useDeployments] Agent fetch failed, falling back to kubectl proxy:', agentErr)
      }
    }

    if (cluster && isInClusterMode()) {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendDeployments = await fetchInClusterCollection<Deployment>('deployments', params, 'deployments')
      if (backendDeployments) {
        const enriched = backendDeployments.map(d => ({ ...d, cluster: d.cluster || cluster }))
        const now = new Date()
        deploymentsCache = { data: enriched, timestamp: now, key: cacheKey }
        setDeployments(enriched)
        setError(null)
        setLastUpdated(now)
        setConsecutiveFailures(0)
        setLastRefresh(now)
        setIsLoading(false)
        if (!silent) {
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
        }
        return
      }
    }

    // Try kubectl proxy as fallback
    if (cluster && !isAgentUnavailable() && !isInClusterMode()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        // Add timeout to prevent hanging
        const deployPromise = kubectlProxy.getDeployments(kubectlContext, namespace)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), MCP_HOOK_TIMEOUT_MS)
        )
        const deployData = await Promise.race([deployPromise, timeoutPromise])

        if (deployData && deployData.length >= 0) {
          const enriched = deployData.map((d: Deployment) => ({ ...d, cluster: d.cluster || cluster }))
          const now = new Date()
          deploymentsCache = { data: enriched, timestamp: now, key: cacheKey }
          setDeployments(enriched)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          if (!silent) {
            setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          } else {
            setIsRefreshing(false)
          }
          return
        }
      } catch (proxyErr: unknown) {
        // kubectl proxy unavailable — fall through to REST API
        console.debug('[useDeployments] kubectl proxy failed, falling back to REST API:', proxyErr)
      }
    }

    // Fall back to REST API
    try {
      if (!LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
        setDeployments([])
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/deployments?${params}`

      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: MCP_HOOK_TIMEOUT_MS,
      })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { deployments: Deployment[] }
      const newDeployments = (data.deployments || []).map(d => ({ ...d, cluster: d.cluster || cluster || 'unknown' }))
      setDeployments(newDeployments)
      setError(null)
      const now = new Date()
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
      deploymentsCache = { data: newDeployments, timestamp: now, key: cacheKey }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch deployments'
      console.error('[useDeployments] All fetch sources failed:', message, err)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentsCache) {
        setError(message)
        setDeployments([])
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
        await new Promise(resolve => setTimeout(resolve, MIN_REFRESH_INDICATOR_MS))
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    // If we have cached data, do a silent refresh
    const hasCachedData = deploymentsCache && deploymentsCache.key === cacheKey
    refetch(hasCachedData ? true : false)
    // Poll for deployment updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `deployments:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`deployments:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cacheKey, consecutiveFailures])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setDeployments([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

  return {
    deployments,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}
