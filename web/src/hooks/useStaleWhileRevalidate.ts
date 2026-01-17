import { useState, useCallback, useRef, useEffect } from 'react'

interface UseStaleWhileRevalidateOptions<T> {
  /** Function to fetch data */
  fetcher: () => Promise<T>
  /** Initial data (optional) */
  initialData?: T
  /** Cache key for localStorage (optional) */
  cacheKey?: string
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number
  /** Refetch interval in milliseconds (optional) */
  refetchInterval?: number
}

interface UseStaleWhileRevalidateResult<T> {
  data: T | undefined
  isLoading: boolean
  isRefreshing: boolean
  isStale: boolean
  error: Error | null
  refetch: () => Promise<void>
  lastUpdated: Date | null
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Hook that returns cached data immediately while fetching fresh data in background.
 * Shows stale data during refresh instead of loading spinner.
 */
export function useStaleWhileRevalidate<T>({
  fetcher,
  initialData,
  cacheKey,
  cacheTTL = 5 * 60 * 1000, // 5 minutes
  refetchInterval,
}: UseStaleWhileRevalidateOptions<T>): UseStaleWhileRevalidateResult<T> {
  // Try to get cached data on initial load
  const getCachedData = useCallback((): T | undefined => {
    if (!cacheKey) return initialData
    try {
      const cached = localStorage.getItem(`swr:${cacheKey}`)
      if (cached) {
        const entry: CacheEntry<T> = JSON.parse(cached)
        // Check if cache is still valid
        if (Date.now() - entry.timestamp < cacheTTL) {
          return entry.data
        }
      }
    } catch {
      // Ignore cache errors
    }
    return initialData
  }, [cacheKey, initialData, cacheTTL])

  const [data, setData] = useState<T | undefined>(getCachedData)
  const [isLoading, setIsLoading] = useState(!data) // Only show loading if no cached data
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const isMounted = useRef(true)
  const fetchCount = useRef(0)

  const saveToCache = useCallback((newData: T) => {
    if (!cacheKey) return
    try {
      const entry: CacheEntry<T> = {
        data: newData,
        timestamp: Date.now(),
      }
      localStorage.setItem(`swr:${cacheKey}`, JSON.stringify(entry))
    } catch {
      // Ignore cache errors (e.g., quota exceeded)
    }
  }, [cacheKey])

  const refetch = useCallback(async () => {
    const currentFetch = ++fetchCount.current

    // If we have data, show refreshing indicator instead of loading
    if (data) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const result = await fetcher()

      // Only update if this is the latest fetch and component is still mounted
      if (currentFetch === fetchCount.current && isMounted.current) {
        setData(result)
        setError(null)
        setLastUpdated(new Date())
        saveToCache(result)
      }
    } catch (err) {
      if (currentFetch === fetchCount.current && isMounted.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch'))
        // Keep stale data on error
      }
    } finally {
      if (currentFetch === fetchCount.current && isMounted.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [data, fetcher, saveToCache])

  // Initial fetch
  useEffect(() => {
    isMounted.current = true
    refetch()

    return () => {
      isMounted.current = false
    }
  }, []) // Only run on mount

  // Refetch interval
  useEffect(() => {
    if (!refetchInterval) return

    const interval = setInterval(() => {
      refetch()
    }, refetchInterval)

    return () => clearInterval(interval)
  }, [refetchInterval, refetch])

  // Check if data is stale (older than TTL)
  const isStale = lastUpdated
    ? Date.now() - lastUpdated.getTime() > cacheTTL
    : false

  return {
    data,
    isLoading,
    isRefreshing,
    isStale,
    error,
    refetch,
    lastUpdated,
  }
}
