import { describe, expect, it } from 'vitest'
import { computeGPUOverviewStats } from '../gpuOverviewStats'
import type { GPUReservation } from '../../../hooks/useGPUReservations'
import type { GPUNode, ResourceQuota } from '../../../hooks/mcp/types'

const BASE_RESERVATION: GPUReservation = {
  id: 'reservation-1',
  user_id: 'user-1',
  user_name: 'alice',
  title: 'GPU job',
  description: '',
  cluster: 'cluster-a',
  namespace: 'ml',
  gpu_count: 1,
  gpu_type: 'NVIDIA A100',
  gpu_types: ['NVIDIA A100'],
  start_date: '2026-05-08',
  duration_hours: 24,
  notes: '',
  status: 'active',
  quota_name: '',
  quota_enforced: false,
  created_at: '2026-05-08T00:00:00Z',
}

const EMPTY_QUOTAS: ResourceQuota[] = []

describe('computeGPUOverviewStats', () => {
  it('zeros reservation headline stats when no GPU inventory is available', () => {
    const stats = computeGPUOverviewStats({
      nodes: [],
      reservations: [
        { ...BASE_RESERVATION, gpu_count: 8, status: 'active' },
        { ...BASE_RESERVATION, id: 'reservation-2', gpu_count: 4, status: 'pending' },
      ],
      gpuQuotas: EMPTY_QUOTAS,
      gpuClusters: [],
    })

    expect(stats.totalGPUs).toBe(0)
    expect(stats.availableGPUs).toBe(0)
    expect(stats.activeReservations).toBe(0)
    expect(stats.reservedGPUs).toBe(0)
  })

  it('counts only reservable reservations and clamps impossible totals', () => {
    const nodes: GPUNode[] = [
      { name: 'gpu-node-1', cluster: 'cluster-a', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 10 },
      { name: 'gpu-node-2', cluster: 'cluster-a', gpuType: 'NVIDIA A100', gpuCount: 2, gpuAllocated: 1 },
    ]

    const stats = computeGPUOverviewStats({
      nodes,
      reservations: [
        { ...BASE_RESERVATION, gpu_count: 4, status: 'active' },
        { ...BASE_RESERVATION, id: 'reservation-2', gpu_count: 5, status: 'pending' },
        { ...BASE_RESERVATION, id: 'reservation-3', gpu_count: 20, status: 'completed' },
      ],
      gpuQuotas: EMPTY_QUOTAS,
      gpuClusters: [{ name: 'cluster-a', totalGPUs: 6, allocatedGPUs: 99 }],
    })

    expect(stats.totalGPUs).toBe(6)
    expect(stats.allocatedGPUs).toBe(6)
    expect(stats.availableGPUs).toBe(0)
    expect(stats.utilizationPercent).toBe(100)
    expect(stats.activeReservations).toBe(2)
    expect(stats.reservedGPUs).toBe(6)
    expect(stats.clusterUsage).toEqual([{ name: 'cluster-a', value: 6 }])
  })
})
