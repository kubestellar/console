import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

/** How often to refresh utilization data (5 minutes) */
const GPU_UTIL_REFRESH_MS = 300_000

/** Timeout for GPU utilization API requests (10 seconds) */
const GPU_UTIL_FETCH_TIMEOUT_MS = 10_000

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
 */
export function useGPUUtilizations(reservationIds: string[]) {
  const [data, setData] = useState<Record<string, GPUUtilizationSnapshot[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const idsRef = useRef<string>('')

  const fetchData = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setData({})
      return
    }

    try {
      setIsLoading(true)
      const params = new URLSearchParams({ ids: (ids || []).join(',') })
      const { data: result } = await api.get<Record<string, GPUUtilizationSnapshot[]>>(
        `/api/gpu/utilizations?${params.toString()}`,
        { timeout: GPU_UTIL_FETCH_TIMEOUT_MS },
      )
      setData(result || {})
    } catch {
      // Silently fail — utilization is supplementary data
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const idsKey = (reservationIds || []).sort().join(',')
    // Only refetch if IDs actually changed
    if (idsKey === idsRef.current && Object.keys(data).length > 0) {
      return
    }
    idsRef.current = idsKey

    fetchData(reservationIds)

    if (reservationIds.length === 0) return

    const interval = setInterval(() => {
      fetchData(reservationIds)
    }, GPU_UTIL_REFRESH_MS)

    return () => clearInterval(interval)
  }, [reservationIds, fetchData]) // eslint-disable-line react-hooks/exhaustive-deps

  return { utilizations: data, isLoading }
}
