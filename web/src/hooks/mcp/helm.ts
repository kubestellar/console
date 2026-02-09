import { useState, useEffect, useCallback, useRef } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from './shared'
import type { HelmRelease, HelmHistoryEntry } from './types'

// Helm releases cache with localStorage persistence
const HELM_RELEASES_CACHE_KEY = 'kc-helm-releases-cache'
const HELM_HISTORY_CACHE_KEY = 'kc-helm-history-cache'
const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale
const HELM_REFRESH_INTERVAL_MS = 120000 // 2 minutes auto-refresh

interface HelmReleasesCache {
  data: HelmRelease[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  listeners: Set<(state: HelmReleasesCacheState) => void>
}

interface HelmReleasesCacheState {
  releases: HelmRelease[]
  isLoading: boolean  // Added for unified demo mode switching
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
}

// Load from localStorage
function loadHelmReleasesFromStorage(): { data: HelmRelease[], timestamp: number } {
  try {
    const stored = localStorage.getItem(HELM_RELEASES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

// Save to localStorage
function saveHelmReleasesToStorage(data: HelmRelease[], timestamp: number) {
  try {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data, timestamp }))
  } catch { /* ignore storage errors */ }
}

// Initialize from localStorage
const storedHelmReleases = loadHelmReleasesFromStorage()

const helmReleasesCache: HelmReleasesCache = {
  data: storedHelmReleases.data,
  timestamp: storedHelmReleases.timestamp,
  consecutiveFailures: 0,
  lastError: null,
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
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
  )

  // Register this component to receive cache updates
  useEffect(() => {
    const updateHandler = (state: HelmReleasesCacheState) => {
      setReleases(state.releases)
      if (state.isLoading !== undefined) setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }
    helmReleasesCache.listeners.add(updateHandler)
    return () => { helmReleasesCache.listeners.delete(updateHandler) }
  }, [])

  const notifyListeners = useCallback((isRefreshing: boolean, isLoading = false) => {
    const state: HelmReleasesCacheState = {
      releases: helmReleasesCache.data,
      isLoading,
      isRefreshing,
      consecutiveFailures: helmReleasesCache.consecutiveFailures,
      lastError: helmReleasesCache.lastError,
      lastRefresh: helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
    }
    helmReleasesCache.listeners.forEach(listener => listener(state))
  }, [])

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching entirely in forced demo mode (Netlify) — no backend
    if (isNetlifyDeployment) {
      setIsLoading(false)
      setIsRefreshing(false)
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

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (isDemoMode()) {
        setLastRefresh(Date.now())
        setIsLoading(false)
        if (!silent) {
          setIsRefreshing(true)
          setTimeout(() => {
            setIsRefreshing(false)
            notifyListeners(false)
          }, MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
          notifyListeners(false)
        }
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { releases: HelmRelease[] }
      const newReleases = data.releases || []

      // Update cache if fetching all clusters
      if (!cluster) {
        helmReleasesCache.data = newReleases
        helmReleasesCache.timestamp = Date.now()
        helmReleasesCache.consecutiveFailures = 0
        helmReleasesCache.lastError = null
        saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
        notifyListeners(false)
      }

      setReleases(newReleases)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm releases'

      // Increment failure count
      if (!cluster) {
        helmReleasesCache.consecutiveFailures++
        helmReleasesCache.lastError = errorMessage
        notifyListeners(false)
      }

      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)
      // Keep existing cached data on error
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

    const interval = setInterval(() => refetch(true), getEffectiveInterval(HELM_REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-releases:${cluster || 'all'}`, () => refetch(false))

    return () => {
      clearInterval(interval)
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

  return { releases, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed, lastRefresh }
}

// Module-level cache for Helm history - keyed by cluster:release
// Uses localStorage for persistence
interface HelmHistoryCacheEntry {
  data: HelmHistoryEntry[]
  timestamp: number
  consecutiveFailures: number
}

// Load helm history cache from localStorage
function loadHelmHistoryFromStorage(): Map<string, HelmHistoryCacheEntry> {
  try {
    const stored = localStorage.getItem(HELM_HISTORY_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed === 'object' && parsed !== null) {
        return new Map(Object.entries(parsed))
      }
    }
  } catch { /* ignore */ }
  return new Map()
}

// Save helm history cache to localStorage
function saveHelmHistoryToStorage(cache: Map<string, HelmHistoryCacheEntry>) {
  try {
    const obj = Object.fromEntries(cache.entries())
    localStorage.setItem(HELM_HISTORY_CACHE_KEY, JSON.stringify(obj))
  } catch { /* ignore storage errors */ }
}

// Initialize from localStorage
const helmHistoryCache = loadHelmHistoryFromStorage()

// Hook to fetch Helm release history
export function useHelmHistory(cluster?: string, release?: string, namespace?: string) {
  const cacheKey = cluster && release ? `${cluster}:${release}` : ''
  const cachedEntry = cacheKey ? helmHistoryCache.get(cacheKey) : undefined
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const [history, setHistory] = useState<HelmHistoryEntry[]>(cachedEntry?.data || [])
  const [isLoading, setIsLoading] = useState(cachedEntry?.data.length === 0 || !cachedEntry)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  const refetch = useCallback(async () => {
    // Always set isRefreshing to show animation on manual refresh (even if returning early)
    setIsRefreshing(true)

    if (!release) {
      setHistory([])
      // Match MIN_SPIN_DURATION (500ms) so animation shows properly
      setTimeout(() => setIsRefreshing(false), 500)
      return
    }
    // Also set loading if no cached data (use functional update to check)
    setHistory(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      }
      return prev
    })

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/gitops/helm-history?${params}`

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (isDemoMode()) {
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { history: HelmHistoryEntry[], error?: string }
      const newHistory = data.history || []
      setHistory(newHistory)
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      // Update cache and persist to localStorage
      if (cluster && release) {
        helmHistoryCache.set(`${cluster}:${release}`, {
          data: newHistory,
          timestamp: Date.now(),
          consecutiveFailures: 0
        })
        saveHelmHistoryToStorage(helmHistoryCache)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm history'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Update cache failure count on error and persist
      if (cluster && release) {
        const currentCached = helmHistoryCache.get(`${cluster}:${release}`)
        if (currentCached) {
          helmHistoryCache.set(`${cluster}:${release}`, {
            ...currentCached,
            consecutiveFailures: (currentCached.consecutiveFailures || 0) + 1
          })
          saveHelmHistoryToStorage(helmHistoryCache)
        }
      }
      // Keep cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
    // Note: cachedEntry deliberately excluded to prevent infinite loops
     
  }, [cluster, release, namespace])

  useEffect(() => {
    // Use cached data if available
    const key = cluster && release ? `${cluster}:${release}` : ''
    const cached = key ? helmHistoryCache.get(key) : undefined
    if (cached && cached.data.length > 0) {
      setHistory(cached.data)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      // Only refetch if cache is stale (older than 30s)
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else if (release) {
      refetch()
    } else {
      // No release selected - not loading, just waiting for user selection
      setIsLoading(false)
    }

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-history:${key}`, refetch)
    return () => unregisterRefetch()
  }, [cluster, release, refetch])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (release) refetch()
  }, [demoMode, refetch, release])

  const isFailed = consecutiveFailures >= 3

  return { history, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
}

// Module-level cache for Helm values - keyed by cluster:release:namespace
const helmValuesCache = new Map<string, {
  values: Record<string, unknown> | string | null
  format: 'json' | 'yaml'
  timestamp: number
  consecutiveFailures: number
}>()

// Hook to fetch Helm release values
export function useHelmValues(cluster?: string, release?: string, namespace?: string) {
  // Build cache key - requires all three params to be valid
  // We must have namespace to make a meaningful API call
  const cacheKey = cluster && release && namespace ? `${cluster}:${release}:${namespace}` : ''
  const cachedEntry = cacheKey ? helmValuesCache.get(cacheKey) : undefined
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const [values, setValues] = useState<Record<string, unknown> | string | null>(cachedEntry?.values || null)
  const [format, setFormat] = useState<'json' | 'yaml'>(cachedEntry?.format || 'json')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  // Track the key we last initiated a fetch for (to avoid duplicate fetches)
  const fetchingKeyRef = useRef<string | null>(null)

  const refetch = useCallback(async () => {
    // Always set isRefreshing to show animation on manual refresh (even if returning early)
    setIsRefreshing(true)

    if (!release) {
      setValues(null)
      // Brief delay before clearing isRefreshing so animation shows
      setTimeout(() => setIsRefreshing(false), 100)
      return
    }

    // Check cache directly to determine if we should show loading state
    const currentCacheKey = cluster && release && namespace ? `${cluster}:${release}:${namespace}` : ''
    const currentCached = currentCacheKey ? helmValuesCache.get(currentCacheKey) : undefined
    if (!currentCached || currentCached.values === null) {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/gitops/helm-values?${params}`

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (isDemoMode()) {
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, {
        method: 'GET',
        headers,
      })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }

      setValues(data.values)
      setFormat(data.format || 'json')
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      // Update cache
      if (cluster && release && namespace) {
        helmValuesCache.set(`${cluster}:${release}:${namespace}`, {
          values: data.values,
          format: data.format || 'json',
          timestamp: Date.now(),
          consecutiveFailures: 0
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Update cache failure count - read from cache directly
      if (cluster && release && namespace) {
        const cacheKeyForError = `${cluster}:${release}:${namespace}`
        const existingCache = helmValuesCache.get(cacheKeyForError)
        if (existingCache) {
          helmValuesCache.set(cacheKeyForError, {
            ...existingCache,
            consecutiveFailures: (existingCache.consecutiveFailures || 0) + 1
          })
        }
      }
      // Keep cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, release, namespace])

  // Effect to trigger fetch when cluster/release/namespace change
  useEffect(() => {
    // Clear values when release is deselected
    if (!release) {
      setValues(null)
      fetchingKeyRef.current = null
      return
    }

    // CRITICAL: Don't fetch until namespace is available
    // Fetching without namespace will return empty results
    if (!namespace) {
      return
    }

    // Build the unique cache key for this request
    const key = `${cluster}:${release}:${namespace}`

    // Skip if we're already fetching/fetched this exact key
    if (fetchingKeyRef.current === key) {
      return
    }

    // Mark that we're handling this key
    fetchingKeyRef.current = key

    // Check cache first
    const cached = helmValuesCache.get(key)

    if (cached && cached.values !== null) {
      // Use cached data
      setValues(cached.values)
      setFormat(cached.format)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      // Refresh in background if stale
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else {
      // No cache - fetch fresh data using direct fetch (bypasses circuit breaker)
      const doFetch = async () => {
        // Skip API calls when using demo token
        const token = localStorage.getItem('token')
        if (isDemoMode()) {
          setIsLoading(false)
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          return
        }

        setIsLoading(true)
        setIsRefreshing(true)
        try {
          const params = new URLSearchParams()
          if (cluster) params.append('cluster', cluster)
          params.append('release', release)
          if (namespace) params.append('namespace', namespace)
          const url = `/api/gitops/helm-values?${params}`

          // Use direct fetch to bypass the global circuit breaker
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          headers['Authorization'] = `Bearer ${token}`
          const response = await fetch(url, {
            method: 'GET',
            headers,
          })
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
          }
          const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }

          setValues(data.values)
          setFormat(data.format || 'json')
          setError(data.error || null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())

          // Update cache
          helmValuesCache.set(key, {
            values: data.values,
            format: data.format || 'json',
            timestamp: Date.now(),
            consecutiveFailures: 0
          })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
          setError(errorMessage)
          setConsecutiveFailures(prev => prev + 1)
        } finally {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
      doFetch()
    }

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-values:${key}`, refetch)
    return () => unregisterRefetch()
  }, [cluster, release, namespace, refetch])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (release && namespace) refetch()
  }, [demoMode, refetch, release, namespace])

  const isFailed = consecutiveFailures >= 3

  return { values, format, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
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

    // Notify all listeners with isLoading: true to trigger skeleton display
    helmReleasesCache.listeners.forEach(listener => {
      listener({
        releases: [],
        isLoading: true,  // Trigger skeleton display
        isRefreshing: false,
        consecutiveFailures: 0,
        lastError: null,
        lastRefresh: null
      })
    })

    console.log('[Helm] Cache cleared for mode transition')
  })
}
