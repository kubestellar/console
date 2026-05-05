import { useState, useEffect, useCallback, useRef } from 'react'
import { isBackendUnavailable } from '../../../lib/api'
import { isDemoMode } from '../../../lib/demoMode'
import { classifyError } from '../../../lib/errorClassifier'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { fetchSSE } from '../../../lib/sseClient'
import { registerRefetch } from '../../../lib/modeTransition'
import { isInClusterMode } from '../../useBackendHealth'
import { isAgentUnavailable } from '../../useLocalAgent'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, clusterCacheRef } from '../shared'
import { subscribePolling } from '../pollingManager'
import type { PodInfo, PodIssue } from '../types'
import { subscribeWorkloadsCache, type WorkloadsSharedState } from '../workloadSubscriptions'
import {
  type PodClusterError,
  type UseAllPodsResult,
  type UsePodIssuesResult,
  type UsePodsResult,
} from './shared'

// ---------------------------------------------------------------------------
// Demo data (internal to this module)
// ---------------------------------------------------------------------------

export function getDemoPods(): PodInfo[] {
  return [
    { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 15, age: '2d', node: 'node-1' },
    { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 8, age: '5h', node: 'gpu-node-2' },
    { name: 'cache-redis-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 5, age: '14d', node: 'node-3' },
    { name: 'frontend-8e9f0a1b2-def34', namespace: 'web', cluster: 'prod-west', status: 'Running', ready: '1/1', restarts: 3, age: '1d', node: 'node-2' },
    { name: 'nginx-ingress-abc123', namespace: 'ingress', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 2, age: '7d', node: 'node-1' },
    { name: 'monitoring-agent-xyz', namespace: 'monitoring', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 1, age: '30d', node: 'node-4' },
    { name: 'api-gateway-pod-1', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '3d', node: 'node-2' },
    { name: 'worker-processor-1', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '12h', node: 'gpu-node-1' },
    { name: 'database-primary-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 0, age: '60d', node: 'node-5' },
    { name: 'scheduler-job-xyz', namespace: 'system', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '4h', node: 'node-1' },
  ]
}

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

export function getDemoAllPods(): PodInfo[] {
  // Returns pods across all clusters for useAllPods
  return [
    ...getDemoPods(),
    { name: 'ml-inference-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'ml-inference-1', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'model-server-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '2/2', restarts: 1, age: '10d', node: 'gpu-node-1' },
    { name: 'training-job-abc', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'gpu-node-1' },
  ]
}

// ---------------------------------------------------------------------------
// Module-level cache for pods data (persists across navigation)
// ---------------------------------------------------------------------------

export const PODS_CACHE_KEY = 'kubestellar-pods-cache'

interface PodsCache {
  data: PodInfo[]
  timestamp: Date
  key: string
}

let podsCache: PodsCache | null = null

// Load pods cache from localStorage on startup
export function loadPodsCacheFromStorage(cacheKey: string): { data: PodInfo[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PODS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        podsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

export function savePodsCacheToStorage() {
  if (podsCache) {
    try {
      localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
        data: podsCache.data,
        timestamp: podsCache.timestamp.toISOString(),
        key: podsCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}
export function usePods(cluster?: string, namespace?: string, sortBy: 'restarts' | 'name' = 'restarts', limit = 10): UsePodsResult {
  // Include sortBy and limit in cache key to prevent cross-view stale data (#7218)
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}:${sortBy}:${limit}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podsCache && podsCache.key === cacheKey) {
      return { data: podsCache.data, timestamp: podsCache.timestamp }
    }
    // Try loading from localStorage
    return loadPodsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pods, setPods] = useState<PodInfo[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoPods = getDemoPods().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      // Sort demo data the same way as live data
      const sortedDemoPods = sortBy === 'restarts'
        ? demoPods.sort((a, b) => b.restarts - a.restarts)
        : demoPods.sort((a, b) => a.name.localeCompare(b.name))
      setPods(sortedDemoPods.slice(0, limit))
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

    // Skip backend fetch when backend is unavailable
    if (isBackendUnavailable()) {
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
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
      setIsRefreshing(true)
      const hasCachedData = podsCache && podsCache.key === cacheKey
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

      const allPods = await fetchSSE<PodInfo>({
        url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/pods/stream`,
        params: sseParams,
        itemsKey: 'pods',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          // Progressive update — show data as it arrives
          setPods(prev => {
            const merged = [...prev, ...items]
            const sorted = sortBy === 'restarts'
              ? merged.sort((a, b) => b.restarts - a.restarts)
              : merged.sort((a, b) => a.name.localeCompare(b.name))
            return sorted.slice(0, limit)
          })
          setIsLoading(false)
        },
      })

      // Final sort & cache with all pods
      let sortedPods = allPods
      if (sortBy === 'restarts') {
        sortedPods = sortedPods.sort((a, b) => b.restarts - a.restarts)
      } else {
        sortedPods = sortedPods.sort((a, b) => a.name.localeCompare(b.name))
      }

      // Store all pods in cache (before limiting) so GPU workloads can use the full list
      const now = new Date()
      podsCache = { data: sortedPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      setPods(sortedPods.slice(0, limit))
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      // Ignore AbortError — expected when cluster/namespace changes during a fetch
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Keep stale data on error — only fall back to demo data when demo mode is active
      const message = err instanceof Error ? err.message : 'Failed to fetch pods'
      console.warn('[usePods] Fetch failed:', message)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podsCache) {
        setError(message)
      }
    } finally {
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, sortBy, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `pods:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`pods:${cacheKey}`, () => {
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
        // Cache was cleared - show skeleton by setting loading with no data
        setIsLoading(true)
        setPods([])
        setLastUpdated(null)
      }
    }
    const unsubscribe = subscribeWorkloadsCache(handleCacheReset)
    return unsubscribe
  }, [])

  return {
    pods,
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
// useAllPods – Hook to get ALL pods (no limit)
// Uses the same cache as usePods but returns all pods without limiting
// ---------------------------------------------------------------------------

// When forceLive is true, skip demo mode fallback and always query the real API.
// Used by GPU cards when running in-cluster with OAuth.
export function useAllPods(cluster?: string, namespace?: string, forceLive = false): UseAllPodsResult {
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podsCache && podsCache.key === cacheKey) {
      return { data: podsCache.data, timestamp: podsCache.timestamp }
    }
    return loadPodsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pods, setPods] = useState<PodInfo[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  // Per-cluster errors from the SSE `cluster_error` event (Issue 9353). Lets
  // consumers (drill-downs) distinguish an RBAC denial on one or more
  // clusters from a globally-transient failure so the UI can show a
  // specific "lacks list-pods RBAC on cluster X" message instead of a
  // generic "detailed list is empty" warning.
  const [clusterErrors, setClusterErrors] = useState<PodClusterError[]>(
    [],
  )
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // If demo mode is enabled (and not overridden by forceLive), use demo data
    if (!forceLive && isDemoMode()) {
      const demoPods = getDemoAllPods().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      setPods(demoPods)
      setIsLoading(false)
      setError(null)
      setClusterErrors([])
      setLastUpdated(new Date())
      return
    }
    if (!silent) {
      const hasCachedData = podsCache && podsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Collect per-cluster error events during this refetch. We replace the
    // previous snapshot atomically when the stream settles so a transient
    // flash of "cluster X failed" isn't left stale after a retry succeeds.
    const collectedErrors: PodClusterError[] = []

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allPods = await fetchSSE<PodInfo>({
        url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/pods/stream`,
        params: sseParams,
        itemsKey: 'pods',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setPods(prev => [...prev, ...items])
          setIsLoading(false)
        },
        onClusterError: (clusterName, errorMessage) => {
          // Classify the raw backend error so consumers can render an
          // RBAC-specific message (auth) instead of "transient failure"
          // (timeout/network/unknown). Backend error strings already
          // contain enough context ("pods is forbidden", "401",
          // "unauthorized", etc.) for the classifier to match.
          const classified = classifyError(errorMessage)
          collectedErrors.push({
            cluster: clusterName,
            errorType: classified.type,
            message: errorMessage,
          })
        },
      })

      const now = new Date()
      podsCache = { data: allPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      setPods(allPods)
      setError(null)
      setClusterErrors(collectedErrors)
      setLastUpdated(now)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch pods'
      console.warn('[useAllPods] Fetch failed:', message)
      setConsecutiveFailures(prev => prev + 1)
      if (!silent && !podsCache) {
        setError(message)
      }
      // Even on catastrophic failure, surface any per-cluster errors we
      // collected before the stream aborted so the UI can still explain
      // the partial state.
      setClusterErrors(collectedErrors)
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey, forceLive])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `allPods:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`allPods:${cacheKey}`, () => {
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
        setPods([])
        setClusterErrors([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

  return {
    pods,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    // Per-cluster errors surfaced from the SSE stream (Issue 9353) so the
    // multi-cluster drill-down can explain an empty list with "lacks
    // list-pods RBAC on cluster X" rather than a generic warning.
    clusterErrors,
    refetch: () => refetch(false) }
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


export function resetPodsCache() {
  try {
    localStorage.removeItem(PODS_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
  podsCache = null
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
    if (cluster && !isAgentUnavailable() && !isInClusterMode()) {
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
