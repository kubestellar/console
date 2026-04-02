import { useState, useEffect, useCallback, useRef } from 'react'
import { STORAGE_KEY_TOKEN } from '../constants'

/**
 * Result returned by useCardFetch — mirrors common data-fetching hook patterns.
 */
export interface CardFetchResult<T = unknown> {
  /** The parsed response data (null while loading or on error) */
  data: T | null
  /** True while the request is in flight */
  loading: boolean
  /** Error message string, or null on success */
  error: string | null
  /** Call to re-fetch the same URL */
  refetch: () => void
}

/** Minimum interval for auto-refresh to prevent abuse (ms) */
const MIN_REFRESH_INTERVAL_MS = 5_000

/** Maximum concurrent useCardFetch hooks per card scope */
const MAX_CONCURRENT_FETCHES = 5

/**
 * Options for useCardFetch.
 */
export interface CardFetchOptions {
  /** Auto-refresh interval in ms (minimum 5 000). Omit or 0 to disable. */
  refreshInterval?: number
  /** If true, the hook will not fetch on mount (call refetch() manually). */
  skip?: boolean
}

/**
 * Per-card fetch scope — mirrors createTimerScope() pattern.
 * Each card gets its own counter so unmounting one card doesn't
 * corrupt the concurrency limit of another.
 */
export function createCardFetchScope() {
  /** Active in-flight fetch count scoped to this card */
  let activeFetchCount = 0

  /**
   * useCardFetch — safe data-fetching hook for Tier 2 custom card code.
   *
   * Fetches external API data through the backend proxy at /api/card-proxy,
   * avoiding CORS issues and keeping fetch/XMLHttpRequest blocked in the sandbox.
   *
   * Usage in custom card code:
   * ```tsx
   * const { data, loading, error } = useCardFetch('https://api.example.com/metrics')
   * ```
   */
  function useCardFetch<T = unknown>(
    url: string | null | undefined,
    options?: CardFetchOptions,
  ): CardFetchResult<T> {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(!options?.skip && !!url)
    const [error, setError] = useState<string | null>(null)
    const mountedRef = useRef(true)
    const fetchIdRef = useRef(0)

    const doFetch = useCallback(() => {
      if (!url) {
        setData(null)
        setLoading(false)
        setError(null)
        return
      }

      // Per-card concurrency guard
      if (activeFetchCount >= MAX_CONCURRENT_FETCHES) {
        setError(`Too many concurrent fetches (max ${MAX_CONCURRENT_FETCHES} per card)`)
        return
      }

      const id = ++fetchIdRef.current
      setLoading(true)
      setError(null)
      activeFetchCount++

      const proxyURL = `/api/card-proxy?url=${encodeURIComponent(url)}`
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)

      fetch(proxyURL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(
              body => { throw new Error(body?.error || `HTTP ${res.status}`) },
              () => { throw new Error(`HTTP ${res.status}`) },
            )
          }
          return res.json()
        })
        .then(json => {
          if (!mountedRef.current || id !== fetchIdRef.current) return
          setData(json as T)
          setLoading(false)
        })
        .catch(err => {
          if (!mountedRef.current || id !== fetchIdRef.current) return
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        })
        .finally(() => {
          activeFetchCount = Math.max(0, activeFetchCount - 1)
        })
    }, [url])

    // Initial fetch + auto-refresh
    useEffect(() => {
      mountedRef.current = true

      if (!options?.skip) {
        doFetch()
      }

      // Set up auto-refresh if requested
      let intervalId: ReturnType<typeof setInterval> | undefined
      if (options?.refreshInterval && options.refreshInterval > 0 && !options?.skip) {
        const clamped = Math.max(options.refreshInterval, MIN_REFRESH_INTERVAL_MS)
        intervalId = setInterval(doFetch, clamped)
      }

      return () => {
        mountedRef.current = false
        if (intervalId) clearInterval(intervalId)
      }
    }, [url, options?.refreshInterval, options?.skip, doFetch])

    return { data, loading, error, refetch: doFetch }
  }

  /** Reset counter — called when the card scope unmounts */
  function resetCount(): void {
    activeFetchCount = 0
  }

  return { useCardFetch, resetCount }
}
