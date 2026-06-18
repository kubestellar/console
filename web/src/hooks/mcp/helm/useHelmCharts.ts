import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { MIN_REFRESH_INDICATOR_MS } from '../shared'
import { MCP_HOOK_TIMEOUT_MS, SHORT_DELAY_MS } from '../../../lib/constants/network'
import type { HelmHistoryEntry } from '../types'

// Cache key - matches the key in useHelmReleases.ts
const HELM_HISTORY_CACHE_KEY = 'kc-helm-history-cache'

// Cache TTL - matches the value in useHelmReleases.ts
const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale

// Demo Helm history entries for a release
function getDemoHelmHistory(): HelmHistoryEntry[] {
  return [
    { revision: 6, updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', description: 'Upgrade failed: container crashed' },
    { revision: 5, updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
    { revision: 4, updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.7.0', app_version: '2.48.0', description: 'Upgrade complete' },
    { revision: 3, updated: new Date(Date.now() - 72 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.6.0', app_version: '2.47.2', description: 'Upgrade complete' },
    { revision: 2, updated: new Date(Date.now() - 168 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.5.0', app_version: '2.47.0', description: 'Upgrade complete' },
    { revision: 1, updated: new Date(Date.now() - 720 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.0.0', app_version: '2.45.0', description: 'Install complete' },
  ]
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
      // Match MIN_SPIN_DURATION so animation shows properly
      setTimeout(() => setIsRefreshing(false), SHORT_DELAY_MS)
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

      // Skip API calls when using demo token — provide demo history
      const token = await getStoredAuthToken()
      if (isDemoMode()) {
        const demoHistory = getDemoHelmHistory()
        setHistory(demoHistory)
        setLastRefresh(Date.now())
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
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
    } catch (err: unknown) {
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

// Export internal symbols for assembly in barrel
export { getDemoHelmHistory, loadHelmHistoryFromStorage, saveHelmHistoryToStorage }
