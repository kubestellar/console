import { useState, useEffect, useCallback, useRef } from 'react'

// Cache entry stored in localStorage
interface CacheEntry<T> {
  data: T
  timestamp: number
  version: number
}

// Cache metadata for tracking failures
interface CacheMeta {
  consecutiveFailures: number
  lastError?: string
  lastSuccessfulRefresh?: number
}

// Data refresh rates by category (in milliseconds)
export const REFRESH_RATES = {
  // Real-time data - refresh frequently
  events: 15000,        // 15 seconds
  pods: 30000,          // 30 seconds
  podIssues: 30000,     // 30 seconds

  // Cluster state - moderate refresh
  clusters: 60000,      // 1 minute
  deployments: 60000,   // 1 minute
  services: 60000,      // 1 minute
  nodes: 60000,         // 1 minute

  // Resource metrics - slightly less frequent
  metrics: 45000,       // 45 seconds
  gpuStatus: 45000,     // 45 seconds

  // Helm/GitOps data - less frequent
  helmReleases: 120000, // 2 minutes
  helmHistory: 300000,  // 5 minutes
  helmValues: 300000,   // 5 minutes
  gitopsDrift: 120000,  // 2 minutes

  // Static-ish data - infrequent refresh
  namespaces: 180000,   // 3 minutes
  rbac: 300000,         // 5 minutes
  quotas: 300000,       // 5 minutes
  operators: 300000,    // 5 minutes

  // Cost data - very infrequent
  costs: 600000,        // 10 minutes

  // Default for unspecified
  default: 120000,      // 2 minutes
} as const

export type RefreshCategory = keyof typeof REFRESH_RATES

// Cache version - increment when cache structure changes
const CACHE_VERSION = 1

// Storage key prefix
const CACHE_PREFIX = 'console_cache_'
const META_PREFIX = 'console_meta_'

// Maximum consecutive failures before marking as failed
const MAX_CONSECUTIVE_FAILURES = 3

// Get data from localStorage
function getFromStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const stored = localStorage.getItem(CACHE_PREFIX + key)
    if (!stored) return null
    const entry = JSON.parse(stored) as CacheEntry<T>
    // Check version compatibility
    if (entry.version !== CACHE_VERSION) return null
    return entry
  } catch {
    return null
  }
}

// Save data to localStorage
function saveToStorage<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch (e) {
    // Storage might be full - try to clear old entries
    console.warn('Failed to save to cache:', e)
  }
}

// Get cache metadata
function getCacheMeta(key: string): CacheMeta {
  try {
    const stored = localStorage.getItem(META_PREFIX + key)
    if (!stored) return { consecutiveFailures: 0 }
    return JSON.parse(stored) as CacheMeta
  } catch {
    return { consecutiveFailures: 0 }
  }
}

// Save cache metadata
function saveCacheMeta(key: string, meta: CacheMeta): void {
  try {
    localStorage.setItem(META_PREFIX + key, JSON.stringify(meta))
  } catch {
    // Ignore storage errors for metadata
  }
}

export interface UseDataCacheOptions<T> {
  // Unique cache key
  cacheKey: string
  // Function to fetch data
  fetcher: () => Promise<T>
  // Refresh category for determining refresh rate
  refreshCategory?: RefreshCategory
  // Custom refresh interval (overrides category)
  refreshInterval?: number
  // Merge function for combining old and new data (default: replace)
  merge?: (oldData: T, newData: T) => T
  // Whether to auto-refresh
  autoRefresh?: boolean
  // Initial data if no cache exists
  initialData: T
  // Whether fetching is enabled (can be used to disable fetching based on conditions)
  enabled?: boolean
}

export interface UseDataCacheResult<T> {
  // The cached/fetched data
  data: T
  // Whether initial load is happening (no cached data)
  isLoading: boolean
  // Whether a refresh is in progress (has cached data)
  isRefreshing: boolean
  // Error message if last fetch failed
  error: string | null
  // Whether the cache has failed 3+ times
  isFailed: boolean
  // Number of consecutive failures
  consecutiveFailures: number
  // Last successful refresh timestamp
  lastRefresh: number | null
  // Manual refresh function
  refetch: () => Promise<void>
  // Clear cache and refetch
  clearAndRefetch: () => Promise<void>
}

export function useDataCache<T>({
  cacheKey,
  fetcher,
  refreshCategory = 'default',
  refreshInterval,
  merge,
  autoRefresh = true,
  initialData,
  enabled = true,
}: UseDataCacheOptions<T>): UseDataCacheResult<T> {
  // Get cached data on initial render
  const cachedEntry = getFromStorage<T>(cacheKey)
  const cachedMeta = getCacheMeta(cacheKey)

  const [data, setData] = useState<T>(cachedEntry?.data ?? initialData)
  const [isLoading, setIsLoading] = useState(!cachedEntry)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(cachedMeta.lastError ?? null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedMeta.consecutiveFailures)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp ?? null)

  // Track if component is mounted
  const mountedRef = useRef(true)
  const fetchingRef = useRef(false)

  // Calculate refresh rate
  const effectiveRefreshInterval = refreshInterval ?? REFRESH_RATES[refreshCategory]

  const refetch = useCallback(async () => {
    if (!enabled || fetchingRef.current) return

    fetchingRef.current = true

    // If we have cached data, show refreshing state; otherwise loading
    const hasCachedData = data !== initialData || cachedEntry !== null
    if (hasCachedData) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const newData = await fetcher()

      if (!mountedRef.current) return

      // Merge or replace data
      const finalData = merge && data !== initialData ? merge(data, newData) : newData

      setData(finalData)
      saveToStorage(cacheKey, finalData)

      // Reset failure tracking on success
      setConsecutiveFailures(0)
      setError(null)
      setLastRefresh(Date.now())

      saveCacheMeta(cacheKey, {
        consecutiveFailures: 0,
        lastSuccessfulRefresh: Date.now(),
      })
    } catch (e) {
      if (!mountedRef.current) return

      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch data'
      setError(errorMessage)

      // Increment failure count
      const newFailureCount = consecutiveFailures + 1
      setConsecutiveFailures(newFailureCount)

      saveCacheMeta(cacheKey, {
        consecutiveFailures: newFailureCount,
        lastError: errorMessage,
        lastSuccessfulRefresh: lastRefresh ?? undefined,
      })

      // Keep existing data on error (don't clear)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
      fetchingRef.current = false
    }
  }, [enabled, fetcher, cacheKey, merge, data, initialData, consecutiveFailures, lastRefresh, cachedEntry])

  const clearAndRefetch = useCallback(async () => {
    localStorage.removeItem(CACHE_PREFIX + cacheKey)
    localStorage.removeItem(META_PREFIX + cacheKey)
    setData(initialData)
    setConsecutiveFailures(0)
    setError(null)
    setLastRefresh(null)
    await refetch()
  }, [cacheKey, initialData, refetch])

  // Initial fetch and auto-refresh
  useEffect(() => {
    mountedRef.current = true

    // Always trigger a refresh on mount (even with cached data)
    if (enabled) {
      refetch()
    }

    // Set up auto-refresh interval
    let intervalId: ReturnType<typeof setInterval> | undefined
    if (autoRefresh && enabled) {
      intervalId = setInterval(refetch, effectiveRefreshInterval)
    }

    return () => {
      mountedRef.current = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [enabled, autoRefresh, effectiveRefreshInterval]) // Intentionally exclude refetch to avoid re-running on every render

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
    consecutiveFailures,
    lastRefresh,
    refetch,
    clearAndRefetch,
  }
}

// Helper hook for array data with merge support
export function useArrayDataCache<T extends { name: string; cluster?: string }>(
  options: Omit<UseDataCacheOptions<T[]>, 'merge' | 'initialData'> & { initialData?: T[] }
): UseDataCacheResult<T[]> {
  // Default merge: update existing items, add new ones, remove missing ones
  const merge = useCallback((_oldData: T[], newData: T[]): T[] => {
    // Start with new data (which includes updates and new items)
    // Old items not in new data are considered removed
    return newData
  }, [])

  return useDataCache({
    ...options,
    initialData: options.initialData ?? [],
    merge,
  })
}

// Helper to clear all cached data
export function clearAllCaches(): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(META_PREFIX))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

// Helper to get cache stats
export function getCacheStats(): { keys: string[]; totalSize: number } {
  const keys: string[] = []
  let totalSize = 0

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(CACHE_PREFIX)) {
      keys.push(key.replace(CACHE_PREFIX, ''))
      const value = localStorage.getItem(key)
      if (value) {
        totalSize += value.length
      }
    }
  }

  return { keys, totalSize }
}
