import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import { useDemoMode, hasRealToken } from './useDemoMode'

/** How often to refresh utilization data (5 minutes) */
const GPU_UTIL_REFRESH_MS = 300_000

/** Timeout for GPU utilization API requests (10 seconds) */
const GPU_UTIL_FETCH_TIMEOUT_MS = 10_000

function isAuthUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'UnauthenticatedError'
    || err.name === 'UnauthorizedError'
    || err.message.includes('No authentication token')
    || err.message.includes('Token is invalid or expired')
}

export interface GPUUtilizationSnapshot {
  id: string
  reservation_id: string
  timestamp: string
  gpu_utilization_pct: number
  memory_utilization_pct: number
  active_gpu_count: number
  total_gpu_count: number
}

/**
 * Bulk-fetch GPU utilization snapshots for multiple reservations.
 * Polls every GPU_UTIL_REFRESH_MS. Skips fetch if no IDs provided.
 *
 * NOTE: The effect is keyed on a stable sorted-ids STRING (not the array
 * identity) so a parent re-render that passes a new array with the same
 * contents does not tear down / re-establish the interval. The interval
 * reads the latest ids from a ref so it always polls the current set.
 */
export function useGPUUtilizations(reservationIds: string[]) {
  const { isDemoMode } = useDemoMode()
  const [data, setData] = useState<Record<string, GPUUtilizationSnapshot[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFailed, setIsFailed] = useState(false)

  // Keep the latest id list in a ref so the polling interval always
  // fetches the current set without needing to be re-created.
  const latestIdsRef = useRef<string[]>(reservationIds || [])
  latestIdsRef.current = reservationIds || []

  // Stable key used to detect actual membership changes.
  const idsKey = [...(reservationIds || [])].sort().join(',')

  const fetchData = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) {
      setData({})
      setError(null)
      setIsFailed(false)
      setIsLoading(false)
      return
    }

    if (isDemoMode) {
      setData({})
      setError(null)
      setIsFailed(false)
      setIsLoading(false)

      if (!(await hasRealToken())) {
        return
      }
    }

    try {
      setIsLoading(true)
      setIsFailed(false)
      setError(null)
      const params = new URLSearchParams({ ids: (ids || []).join(',') })
      const { data: result } = await api.get<Record<string, GPUUtilizationSnapshot[]>>(
        `/api/gpu/utilizations?${params.toString()}`,
        { timeout: GPU_UTIL_FETCH_TIMEOUT_MS },
      )
      setData(result || {})
    } catch (err) {
      if (isAuthUnavailableError(err)) {
        console.debug('[useGPUUtilizations] Skipped - no auth token')
        setError(null)
        setIsFailed(false)
        setData({})
        return
      }

      const message = err instanceof Error ? err.message : 'GPU utilization fetch failed'
      console.error('[useGPUUtilizations] Fetch failed:', message)
      setError(message)
      setIsFailed(true)
      setData({})
    } finally {
      setIsLoading(false)
    }
  }, [isDemoMode])

  useEffect(() => {
    // Initial fetch for the current id set.
    fetchData(latestIdsRef.current)

    // Do not set up an interval when there's nothing to poll.
    if (!latestIdsRef.current || latestIdsRef.current.length === 0) {
      return
    }

    // Always set up the polling interval — it was previously skipped/torn
    // down once data arrived, which left utilization stale indefinitely.
    const interval = setInterval(() => {
      fetchData(latestIdsRef.current)
    }, GPU_UTIL_REFRESH_MS)

    return () => clearInterval(interval)
    // Re-run only when the set of reservation ids actually changes
    // (by value, not by array identity) or the memoized fetcher changes.
  }, [idsKey, fetchData])

  return { utilizations: data, isLoading, error, isFailed }
}
