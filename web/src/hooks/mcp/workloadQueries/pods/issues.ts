import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { fetchSSE } from '../../../lib/sseClient'
import { registerRefetch } from '../../../lib/modeTransition'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import { isAgentUnavailable } from '../../useLocalAgent'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, clusterCacheRef } from '../shared'
import { subscribePolling } from '../pollingManager'
import type { PodIssue } from '../types'
import { subscribeWorkloadsCache, type WorkloadsSharedState } from '../workloadSubscriptions'
import { type UsePodIssuesResult } from '../shared'

export function getDemoPodIssues(): PodIssue[] {
  return [
    {
      name: 'api-server-crash-7d8f9c6b5',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'CrashLoopBackOff',
      restarts: 23,
      reason: 'CrashLoopBackOff',
      issues: ['Back-off 5m0s restarting failed container'],
    },
    {
      name: 'worker-oom-5c6d7e8f9',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'OOMKilled',
      restarts: 8,
      reason: 'OOMKilled',
      issues: ['Container exceeded memory limit'],
    },
    {
      name: 'pending-pod-abc123',
      namespace: 'staging',
      cluster: 'staging',
      status: 'Pending',
      restarts: 0,
      reason: 'Unschedulable',
      issues: ['No nodes available with required resources'],
    },
  ]
}

// ---------------------------------------------------------------------------
// Module-level cache for pod issues data (persists across navigation)
// ---------------------------------------------------------------------------

interface PodIssuesCache {
  data: PodIssue[]
  timestamp: Date
  key: string
}

let podIssuesCache: PodIssuesCache | null = null

export function __resetPodIssuesCache() {
  podIssuesCache = null
}

// ---------------------------------------------------------------------------
// usePodIssues
// ---------------------------------------------------------------------------

export function usePodIssues(cluster?: string, namespace?: string): UsePodIssuesResult {
  const cacheKey = `podIssues:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podIssuesCache && podIssuesCache.key === cacheKey) {
      return { data: podIssuesCache.data, timestamp: podIssuesCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [issues, setIssues] = useState<PodIssue[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)
  const sseAbortRef = useRef<AbortController | null>(null)

  // Track previous values to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  // Reset state only when cluster/namespace actually CHANGES (not on initial mount)
  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace

    if (clusterChanged || namespaceChanged) {
      setIssues([])
      setIsLoading(true)
      setError(null)
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoIssues = getDemoPodIssues().filter(i =>
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
      const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    // Try kubectl proxy first when cluster is specified (for cluster-specific issues)
    if (cluster && !isAgentUnavailable() && !isClusterModeBackend()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        const podIssuesData = await kubectlProxy.getPodIssues(kubectlContext, namespace)
        // Guard against null/undefined when proxy is disconnected or in cooldown
        const safePodIssues = podIssuesData || []
        const now = new Date()
        podIssuesCache = { data: safePodIssues, timestamp: now, key: cacheKey }
        setIssues(safePodIssues)
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
      } catch (proxyErr: unknown) {
        // kubectl proxy failed, fall through to SSE
        console.debug('[usePodIssues] kubectl proxy failed, falling back to SSE:', proxyErr)
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

      // pod-issues is a backend-only endpoint (#9996) — route SSE via /api/mcp/
      const allIssues = await fetchSSE<PodIssue>({
        url: `/api/mcp/pod-issues/stream`,
        params: sseParams,
        itemsKey: 'issues',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setIssues(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })

      const now = new Date()
      podIssuesCache = { data: allIssues, timestamp: now, key: cacheKey }
      setIssues(allIssues)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch pod issues'
      console.warn('[usePodIssues] Fetch failed:', message)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podIssuesCache) {
        setError(message)
        setIssues([])
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
    const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod issue updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `podIssues:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`podIssues:${cacheKey}`, () => {
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
