import { useState, useCallback, useRef } from 'react'

// Default refresh interval (2 minutes)
const DEFAULT_REFRESH_INTERVAL_MS = 120000

export interface ProgressiveDataSource<T> {
  /** Unique identifier for this source (e.g., cluster name) */
  id: string
  /** Async function that fetches data from this source */
  fetch: () => Promise<T[]>
}

export interface UseProgressiveDataOptions {
  /** Refresh interval in milliseconds. Default: 120000 (2 minutes) */
  refreshInterval?: number
  /** Maximum consecutive failures before marking as failed. Default: 3 */
  maxFailures?: number
}

export interface UseProgressiveDataReturn<T> {
  /** Current data items */
  items: T[]
  /** True during initial load (before any data arrives) */
  isLoading: boolean
  /** True during any refresh (including background) */
  isRefreshing: boolean
  /** Error message if last fetch failed */
  error: string | null
  /** True if consecutive failures exceed maxFailures */
  isFailed: boolean
  /** Number of consecutive failures */
  consecutiveFailures: number
  /** Timestamp of last successful refresh */
  lastRefresh: Date | null
  /** Manually trigger a refresh */
  refetch: () => void
  /** Start automatic polling */
  startPolling: () => () => void
}

/**
 * Hook for progressive data loading from multiple sources.
 *
 * Data is shown progressively as each source returns results,
 * rather than waiting for all sources to complete.
 *
 * @example
 * ```tsx
 * const sources = useMemo(() => [
 *   { id: 'cluster1', fetch: () => fetchFromCluster('cluster1') },
 *   { id: 'cluster2', fetch: () => fetchFromCluster('cluster2') },
 * ], [])
 *
 * const { items, isLoading, refetch, startPolling } = useProgressiveData(sources)
 *
 * useEffect(() => {
 *   refetch()
 *   return startPolling()
 * }, [])
 * ```
 */
export function useProgressiveData<T>(
  sources: ProgressiveDataSource<T>[],
  options: UseProgressiveDataOptions = {}
): UseProgressiveDataReturn<T> {
  const {
    refreshInterval = DEFAULT_REFRESH_INTERVAL_MS,
    maxFailures = 3,
  } = options

  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  const refetch = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
      // Clear items at start of non-silent refresh for progressive loading
      setItems([])
    }

    let hasAnyData = false
    let lastError: Error | null = null

    // Process sources sequentially to avoid overwhelming connections
    for (const source of sources) {
      try {
        const sourceItems = await source.fetch()

        if (sourceItems.length > 0) {
          hasAnyData = true
          // Progressive update: append data as each source returns
          setItems(prev => [...prev, ...sourceItems])

          // Clear loading state after first batch of data arrives
          if (!initialLoadDone.current) {
            setIsLoading(false)
            initialLoadDone.current = true
          }
        }
      } catch (err) {
        console.warn(`[useProgressiveData] Error fetching from source ${source.id}:`, err)
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    // Update final state
    if (hasAnyData) {
      setError(null)
      setConsecutiveFailures(0)
    } else if (lastError) {
      setConsecutiveFailures(prev => prev + 1)
      if (!silent) {
        setError(lastError.message)
      }
    }

    setLastRefresh(new Date())
    initialLoadDone.current = true
    setIsLoading(false)
    setIsRefreshing(false)
  }, [sources])

  const startPolling = useCallback(() => {
    const interval = setInterval(() => refetch(true), refreshInterval)
    return () => clearInterval(interval)
  }, [refetch, refreshInterval])

  return {
    items,
    isLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= maxFailures,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
    startPolling,
  }
}

/**
 * Simplified progressive data hook for a single fetch function that returns batched results.
 * Useful when you have a function that already handles multiple sources internally.
 *
 * @example
 * ```tsx
 * const { items, isLoading, appendItems, reset, finalize } = useProgressiveState<Server>()
 *
 * // In your fetch function:
 * reset() // Clear on refresh start
 * for (const cluster of clusters) {
 *   const data = await fetchCluster(cluster)
 *   appendItems(data) // Progressive update
 * }
 * finalize() // Mark complete
 * ```
 */
export function useProgressiveState<T>() {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const initialLoadDone = useRef(false)

  const reset = useCallback((silent = false) => {
    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
      setItems([])
    }
  }, [])

  const appendItems = useCallback((newItems: T[]) => {
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems])
      // Clear loading after first batch
      if (!initialLoadDone.current) {
        setIsLoading(false)
        initialLoadDone.current = true
      }
    }
  }, [])

  const finalize = useCallback(() => {
    initialLoadDone.current = true
    setIsLoading(false)
    setIsRefreshing(false)
  }, [])

  const clear = useCallback(() => {
    setItems([])
    initialLoadDone.current = false
    setIsLoading(true)
  }, [])

  return {
    items,
    isLoading,
    isRefreshing,
    appendItems,
    reset,
    finalize,
    clear,
    setItems,
  }
}
