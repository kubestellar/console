import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

const REFRESH_INTERVAL_MS = 30000

export type ReservationStatus = 'pending' | 'active' | 'completed' | 'cancelled'

export interface GPUReservation {
  id: string
  user_id: string
  user_name: string
  title: string
  description: string
  cluster: string
  namespace: string
  gpu_count: number
  gpu_type: string
  start_date: string
  duration_hours: number
  notes: string
  status: ReservationStatus
  quota_name: string
  quota_enforced: boolean
  created_at: string
  updated_at?: string
}

export interface CreateGPUReservationInput {
  title: string
  description?: string
  cluster: string
  namespace: string
  gpu_count: number
  gpu_type?: string
  start_date: string
  duration_hours?: number
  notes?: string
  quota_name?: string
  quota_enforced?: boolean
  max_cluster_gpus?: number
}

export interface UpdateGPUReservationInput {
  title?: string
  description?: string
  cluster?: string
  namespace?: string
  gpu_count?: number
  gpu_type?: string
  start_date?: string
  duration_hours?: number
  notes?: string
  status?: ReservationStatus
  quota_name?: string
  quota_enforced?: boolean
  max_cluster_gpus?: number
}

export function useGPUReservations(onlyMine = false) {
  const [reservations, setReservations] = useState<GPUReservation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchReservations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const query = onlyMine ? '?mine=true' : ''
      const { data } = await api.get<GPUReservation[]>(`/api/gpu/reservations${query}`)
      setReservations(data)
      setError(null)
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch reservations')
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [onlyMine])

  // GPU reservations are always live — even in demo mode they come from the real API.
  // This is the only dashboard where content should be live at all times.
  useEffect(() => {
    fetchReservations(false)
    intervalRef.current = setInterval(() => fetchReservations(true), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchReservations])

  const createReservation = useCallback(async (input: CreateGPUReservationInput): Promise<GPUReservation> => {
    const { data } = await api.post<GPUReservation>('/api/gpu/reservations', input)
    // Refresh list after create
    fetchReservations(true)
    return data
  }, [fetchReservations])

  const updateReservation = useCallback(async (id: string, input: UpdateGPUReservationInput): Promise<GPUReservation> => {
    const { data } = await api.put<GPUReservation>(`/api/gpu/reservations/${id}`, input)
    fetchReservations(true)
    return data
  }, [fetchReservations])

  const deleteReservation = useCallback(async (id: string): Promise<void> => {
    await api.delete(`/api/gpu/reservations/${id}`)
    fetchReservations(true)
  }, [fetchReservations])

  return {
    reservations,
    isLoading,
    error,
    refetch: () => fetchReservations(false),
    createReservation,
    updateReservation,
    deleteReservation,
  }
}
