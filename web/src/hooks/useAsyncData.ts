/**
 * Generic async data hook for drill-down views and cards.
 * Manages data/loading/error state with cancellation on unmount or dependency change.
 */
import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Re-runs the fetcher; cancels any in-flight request. Returns a promise that settles when the run finishes. */
  refetch: () => Promise<void>
}

export interface UseAsyncDataOptions<T> {
  /** Initial value before the first fetch (e.g. pod cache). */
  initialData?: T | null
  /** When false, skips auto-fetch on mount/deps change; use refetch() manually. Default true. */
  enabled?: boolean
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options?: UseAsyncDataOptions<T>,
): AsyncState<T> {
  const initialData = options?.initialData ?? null
  const enabled = options?.enabled !== false

  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancelActiveRef = useRef<(() => void) | null>(null)

  const cancelActive = useCallback(() => {
    cancelActiveRef.current?.()
    cancelActiveRef.current = null
  }, [])

  const run = useCallback((): Promise<void> => {
    cancelActive()

    let cancelled = false
    setLoading(true)
    setError(null)

    const finish = () => {
      if (!cancelled) {
        cancelActiveRef.current = null
      }
    }

    cancelActiveRef.current = () => {
      cancelled = true
    }

    return fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
      .finally(finish)
  }, [...deps, cancelActive]) // eslint-disable-line react-hooks/exhaustive-deps -- caller controls invalidation via deps

  useEffect(() => {
    if (enabled) {
      void run()
    }

    return cancelActive
  }, [run, enabled, cancelActive])

  const refetch = useCallback(() => run(), [run])

  return { data, loading, error, refetch }
}
