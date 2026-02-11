import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useDemoMode } from './useDemoMode'

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

// Demo mock data
const DEMO_RESERVATIONS: GPUReservation[] = [
  {
    id: 'demo-res-1',
    user_id: 'demo-user',
    user_name: 'alice',
    title: 'LLM Fine-tuning Job',
    description: 'Fine-tuning Llama 3 70B on custom dataset',
    cluster: 'eks-prod-us-east',
    namespace: 'ml-training',
    gpu_count: 8,
    gpu_type: 'NVIDIA A100',
    start_date: new Date().toISOString().split('T')[0],
    duration_hours: 48,
    notes: 'Priority training run for Q1 release',
    status: 'active',
    quota_name: 'llm-finetune-quota',
    quota_enforced: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-res-2',
    user_id: 'demo-user-2',
    user_name: 'bob',
    title: 'Inference Benchmark',
    description: 'Benchmarking vLLM serving throughput',
    cluster: 'gke-ml-cluster',
    namespace: 'benchmarks',
    gpu_count: 4,
    gpu_type: 'NVIDIA H100',
    start_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    duration_hours: 24,
    notes: '',
    status: 'pending',
    quota_name: '',
    quota_enforced: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'demo-res-3',
    user_id: 'demo-user',
    user_name: 'alice',
    title: 'Distributed Training - GPT',
    description: 'Multi-node distributed training experiment',
    cluster: 'eks-prod-us-east',
    namespace: 'ml-training',
    gpu_count: 16,
    gpu_type: 'NVIDIA A100',
    start_date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
    duration_hours: 72,
    notes: 'Completed successfully',
    status: 'completed',
    quota_name: 'dist-train-quota',
    quota_enforced: true,
    created_at: new Date(Date.now() - 259200000).toISOString(),
  },
]

export function useGPUReservations(onlyMine = false) {
  const [reservations, setReservations] = useState<GPUReservation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
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

  useEffect(() => {
    if (demoMode) {
      setReservations(DEMO_RESERVATIONS)
      setIsLoading(false)
      setError(null)
      return
    }

    fetchReservations(false)
    intervalRef.current = setInterval(() => fetchReservations(true), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [demoMode, fetchReservations])

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
