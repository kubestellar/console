import { useState, useEffect, useCallback, useRef } from 'react'
import { isBackendUnavailable } from '../../../lib/api'
import { isDemoMode } from '../../../lib/demoMode'
import { classifyError } from '../../../lib/errorClassifier'
import { fetchSSE } from '../../../lib/sseClient'
import { registerRefetch } from '../../../lib/modeTransition'
import { getClusterModeBaseUrl } from '../../../lib/cache/fetcherUtils'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from '../shared'
import { subscribePolling } from '../pollingManager'
import type { PodInfo } from '../types'
import { subscribeWorkloadsCache, type WorkloadsSharedState } from '../workloadSubscriptions'
import {
  type PodClusterError,
  type UseAllPodsResult,
  type UsePodsResult,
} from './shared'
import { getDemoPods, getDemoAllPods } from './podsDemo'
import { podCacheStore, loadPodsCacheFromStorage, savePodsCacheToStorage } from './podsCache'

export { getDemoPods, getDemoPodIssues, getDemoAllPods } from './podsDemo'
export { PODS_CACHE_KEY, loadPodsCacheFromStorage, savePodsCacheToStorage, resetPodsCache } from './podsCache'
export { usePodIssues } from './podIssues'

export function usePods(cluster?: string, namespace?: string, sortBy: 'restarts' | 'name' = 'restarts', limit = 10): UsePodsResult {
  // Include sortBy and limit in cache key to prevent cross-view stale data (#7218)
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}:${sortBy}:${limit}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podCacheStore.pods && podCacheStore.pods.key === cacheKey) {
      return { data: podCacheStore.pods.data, timestamp: podCacheStore.pods.timestamp }
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
  const refreshIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefreshIndicatorClear = useCallback(() => {
    if (refreshIndicatorTimeoutRef.current) {
      clearTimeout(refreshIndicatorTimeoutRef.current)
    }
    refreshIndicatorTimeoutRef.current = setTimeout(() => {
      setIsRefreshing(false)
      refreshIndicatorTimeoutRef.current = null
    }, MIN_REFRESH_INDICATOR_MS)
  }, [])

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
        scheduleRefreshIndicatorClear()
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
        scheduleRefreshIndicatorClear()
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = podCacheStore.pods && podCacheStore.pods.key === cacheKey
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
        url: `${getClusterModeBaseUrl()}/pods/stream`,
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
      podCacheStore.pods = { data: sortedPods, timestamp: now, key: cacheKey }
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
      if (!silent && !podCacheStore.pods) {
        setError(message)
      }
    } finally {
      setIsLoading(false)
      if (!silent) {
        scheduleRefreshIndicatorClear()
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cacheKey, cluster, limit, namespace, scheduleRefreshIndicatorClear, sortBy])

  useEffect(() => {
    const hasCachedData = podCacheStore.pods && podCacheStore.pods.key === cacheKey
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
      if (refreshIndicatorTimeoutRef.current) {
        clearTimeout(refreshIndicatorTimeoutRef.current)
        refreshIndicatorTimeoutRef.current = null
      }
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
    if (podCacheStore.pods && podCacheStore.pods.key === cacheKey) {
      return { data: podCacheStore.pods.data, timestamp: podCacheStore.pods.timestamp }
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
      const hasCachedData = podCacheStore.pods && podCacheStore.pods.key === cacheKey
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
        url: `${getClusterModeBaseUrl()}/pods/stream`,
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
      podCacheStore.pods = { data: allPods, timestamp: now, key: cacheKey }
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
      if (!silent && !podCacheStore.pods) {
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
    const hasCachedData = podCacheStore.pods && podCacheStore.pods.key === cacheKey
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
