import { useState, useEffect, useCallback, useRef } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../../lib/demoMode'
import { fetchSSE } from '../../../lib/sseClient'
import { useDemoMode } from '../../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { getEffectiveInterval } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS, areOptionalPollersSuppressed } from '../../../lib/constants/network'
import type { HelmRelease } from '../types'
import { getDemoHelmReleases } from '../helm.demo'
import {
  HELM_RELEASES_CACHE_KEY,
  HELM_HISTORY_CACHE_KEY,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
  loadHelmReleasesFromStorage,
  saveHelmReleasesToStorage,
  type HelmReleasesCache,
  type HelmReleasesCacheState,
} from './helmCache'

// Initialize from localStorage
const storedHelmReleases = loadHelmReleasesFromStorage()

const helmReleasesCache: HelmReleasesCache = {
  data: storedHelmReleases.data,
  timestamp: storedHelmReleases.timestamp,
  consecutiveFailures: 0,
  lastError: null,
  isDemoData: false,
  listeners: new Set()
}

// Hook to get Helm releases - uses shared cache with localStorage persistence
export function useHelmReleases(cluster?: string) {
  // Initialize from cache (localStorage backed)
  const [releases, setReleases] = useState<HelmRelease[]>(helmReleasesCache.data)
  const [isLoading, setIsLoading] = useState(helmReleasesCache.data.length === 0)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(helmReleasesCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(helmReleasesCache.consecutiveFailures)
  const consecutiveFailuresRef = useRef(consecutiveFailures)
  consecutiveFailuresRef.current = consecutiveFailures
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
  )
  const [isDemoData, setIsDemoData] = useState(helmReleasesCache.isDemoData)
  // Track latest local releases so error-fallback path can decide whether to
  // overwrite existing data with demo data. This matters for cluster-scoped
  // fetches where the module-level cache is not populated on success (#21083).
  const releasesRef = useRef(releases)
  releasesRef.current = releases

  // Register this component to receive cache updates
  useEffect(() => {
    const updateHandler = (state: HelmReleasesCacheState) => {
      setReleases(state.releases)
      if (state.isLoading !== undefined) setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
      setIsDemoData(state.isDemoData)
    }
    helmReleasesCache.listeners.add(updateHandler)
    return () => { helmReleasesCache.listeners.delete(updateHandler) }
  }, [])

  // Stable reference — prevents refetch useCallback from changing every render
  const notifyListenersRef = useRef((isRefreshing: boolean, isLoading = false) => {
    const state: HelmReleasesCacheState = {
      releases: helmReleasesCache.data,
      isLoading,
      isRefreshing,
      consecutiveFailures: helmReleasesCache.consecutiveFailures,
      lastError: helmReleasesCache.lastError,
      lastRefresh: helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null,
      isDemoData: helmReleasesCache.isDemoData
    }
    helmReleasesCache.listeners.forEach(listener => listener(state))
  })
  const notifyListeners = notifyListenersRef.current

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching entirely in forced demo mode (Netlify) — no backend
    if (areOptionalPollersSuppressed() || isNetlifyDeployment) {
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      notifyListeners(false)
      return
    }

    if (!silent) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
      notifyListeners(true)
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const url = `/api/gitops/helm-releases?${params}`

      // Skip API calls when using demo token — provide demo releases
      const token = await getStoredAuthToken()
      if (isDemoMode()) {
        const demoReleases = getDemoHelmReleases()
        if (!cluster) {
          helmReleasesCache.data = demoReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          helmReleasesCache.isDemoData = true
          notifyListeners(false)
        }
        setReleases(demoReleases)
        setLastRefresh(Date.now())
        setIsDemoData(true)
        setIsLoading(false)
        setIsRefreshing(false)
        notifyListeners(false)
        return
      }

      // Try SSE streaming first for progressive rendering
      const sseAvailable = token && token !== 'demo-token'
      let sseSucceeded = false

      if (sseAvailable) {
        try {
          const sseParams: Record<string, string> = {}
          if (cluster) sseParams.cluster = cluster
          const accumulated: HelmRelease[] = []

          const result = await fetchSSE<HelmRelease>({
            url: '/api/gitops/helm-releases/stream',
            params: sseParams,
            itemsKey: 'releases',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setReleases([...accumulated])
              setIsLoading(false)
            } })

          sseSucceeded = true
          const newReleases = result

          if (!cluster) {
            helmReleasesCache.data = newReleases
            helmReleasesCache.timestamp = Date.now()
            helmReleasesCache.consecutiveFailures = 0
            helmReleasesCache.lastError = null
            helmReleasesCache.isDemoData = false
            saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
            notifyListeners(false)
          }

          setReleases(newReleases)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
          setIsDemoData(false)
        } catch {
          // SSE failed — fall through to REST
        }
      }

      // REST fallback if SSE unavailable or failed
      if (!sseSucceeded) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        const data = await response.json() as { releases: HelmRelease[] }
        const newReleases = data.releases || []

        if (!cluster) {
          helmReleasesCache.data = newReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          helmReleasesCache.isDemoData = false
          saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
          notifyListeners(false)
        }

        setReleases(newReleases)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        setIsDemoData(false)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm releases'

      // Increment failure count
      if (!cluster) {
        helmReleasesCache.consecutiveFailures++
        helmReleasesCache.lastError = errorMessage
        notifyListeners(false)
      }

      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Fall back to demo data when API fails and no data is available at all.
      // Check BOTH the module-level cache (all-cluster fetches) AND the local
      // releases state (per-cluster fetches don't touch the module cache).
      // Without the local check, a failed refetch after a successful per-cluster
      // fetch would overwrite live data with demo data (#21083).
      if (helmReleasesCache.data.length === 0 && releasesRef.current.length === 0) {
        const demoReleases = getDemoHelmReleases()
        if (!cluster) {
          // Update cache so notifyListeners in finally reflects demo data
          helmReleasesCache.data = demoReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.isDemoData = true
        }
        setReleases(demoReleases)
        setLastRefresh(Date.now())
        setIsDemoData(true)
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      if (!cluster) notifyListeners(false)
    }
  }, [cluster, notifyListeners])

  useEffect(() => {
    // Use cached data if fresh enough and we're fetching all clusters
    const now = Date.now()
    const cacheAge = now - helmReleasesCache.timestamp
    const cacheValid = !cluster && helmReleasesCache.data.length > 0 && cacheAge < HELM_CACHE_TTL_MS

    if (cacheValid) {
      setReleases(helmReleasesCache.data)
      setIsLoading(false)
      // Still refresh in background if somewhat stale
      if (cacheAge > HELM_CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    // Poll for Helm releases (shared interval prevents duplicates across components)
    // Use ref for consecutiveFailures to avoid re-triggering effect on each failure
    const unsubscribePolling = subscribePolling(
      `helmReleases:${cluster || 'all'}`,
      getEffectiveInterval(HELM_REFRESH_INTERVAL_MS, consecutiveFailuresRef.current),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-releases:${cluster || 'all'}`, () => refetch(false))

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cluster])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  const isFailed = consecutiveFailures >= 3

  return { releases, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed, lastRefresh, isDemoData }
}

/**
 * Reset the module-level Helm releases cache to its localStorage-backed
 * state and clear listeners. Exported only for the `__helmTestables` test
 * seam (see `helm/index.ts`) — not part of the public hook API.
 */
export function resetHelmReleasesCacheForTest() {
  const fresh = loadHelmReleasesFromStorage()
  helmReleasesCache.data = fresh.data
  helmReleasesCache.timestamp = fresh.timestamp
  helmReleasesCache.consecutiveFailures = 0
  helmReleasesCache.lastError = null
  helmReleasesCache.listeners.clear()
}

// Register with mode transition coordinator for unified cache clearing
if (typeof window !== 'undefined') {
  registerCacheReset('helm', () => {
    try {
      localStorage.removeItem(HELM_RELEASES_CACHE_KEY)
      localStorage.removeItem(HELM_HISTORY_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    // Reset module-level cache
    helmReleasesCache.data = []
    helmReleasesCache.timestamp = 0
    helmReleasesCache.consecutiveFailures = 0
    helmReleasesCache.lastError = null
    helmReleasesCache.isDemoData = false

    // Notify all listeners with isLoading: true to trigger skeleton display
    helmReleasesCache.listeners.forEach(listener => {
      listener({
        releases: [],
        isLoading: true,  // Trigger skeleton display
        isRefreshing: false,
        consecutiveFailures: 0,
        lastError: null,
        lastRefresh: null,
        isDemoData: false
      })
    })
  })
}
