import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NavigateFunction } from 'react-router-dom'
import type { ClusterStats } from '../useClusterStats'

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterStatsDrillDown: mockEmit,
}))

import { getClusterDashboardStatValue } from '../clusterStatValues'
import { ROUTES } from '../../../config/routes'

function makeStats(overrides: Partial<ClusterStats> = {}): ClusterStats {
  return {
    total: 5,
    loading: 0,
    healthy: 3,
    unhealthy: 1,
    unreachable: 1,
    staleContexts: 0,
    healthyNodes: 8,
    totalNodes: 10,
    totalCPUs: 64,
    totalMemoryGB: 512,
    totalStorageGB: 2048,
    totalPods: 120,
    totalGPUs: 4,
    allocatedGPUs: 2,
    hasResourceData: true,
    ...overrides,
  }
}

describe('getClusterDashboardStatValue', () => {
  let navigate: NavigateFunction
  let setFilter: ReturnType<typeof vi.fn>
  let setShowClusterGrid: ReturnType<typeof vi.fn>
  let openGPUModal: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockEmit.mockClear()
    navigate = vi.fn() as unknown as NavigateFunction
    setFilter = vi.fn()
    setShowClusterGrid = vi.fn()
    openGPUModal = vi.fn()
  })

  const callbacks = () => ({ navigate, setFilter, setShowClusterGrid, openGPUModal })

  it('clusters: reports total count and is clickable when >0', () => {
    const result = getClusterDashboardStatValue('clusters', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(5)
    expect(result.isClickable).toBe(true)
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('cluster_health_status')
    expect(setFilter).toHaveBeenCalledWith('all')
    expect(setShowClusterGrid).toHaveBeenCalledWith(true)
  })

  it('healthy: reports healthy count and progress max', () => {
    const result = getClusterDashboardStatValue('healthy', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(3)
    expect(result.max).toBe(10)
    result.onClick?.()
    expect(setFilter).toHaveBeenCalledWith('healthy')
  })

  it('unhealthy: reports unhealthy count', () => {
    const result = getClusterDashboardStatValue('unhealthy', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(1)
    result.onClick?.()
    expect(setFilter).toHaveBeenCalledWith('unhealthy')
  })

  it('unreachable: reports unreachable count', () => {
    const result = getClusterDashboardStatValue('unreachable', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(1)
    result.onClick?.()
    expect(setFilter).toHaveBeenCalledWith('unreachable')
  })

  it('nodes: shows totalNodes and healthyNodes when hasData', () => {
    const result = getClusterDashboardStatValue('nodes', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(10)
    expect(result.progressValue).toBe(8)
    expect(result.max).toBe(10)
    expect(result.isClickable).toBe(true)
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('nodes')
    expect(navigate).toHaveBeenCalledWith(ROUTES.COMPUTE)
  })

  it('nodes: shows dash and is not clickable when hasData is false', () => {
    const result = getClusterDashboardStatValue('nodes', makeStats(), false, 10, callbacks())
    expect(result.value).toBe('-')
    expect(result.isClickable).toBe(false)
  })

  it('cpus: shows totalCPUs and navigates to compute', () => {
    const result = getClusterDashboardStatValue('cpus', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(64)
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('cpu')
    expect(navigate).toHaveBeenCalledWith(ROUTES.COMPUTE)
  })

  it('cpus: shows dash when hasData is false', () => {
    const result = getClusterDashboardStatValue('cpus', makeStats(), false, 10, callbacks())
    expect(result.value).toBe('-')
  })

  it('memory: formats totalMemoryGB via formatMemoryStat', () => {
    const result = getClusterDashboardStatValue('memory', makeStats({ totalMemoryGB: 512 }), true, 10, callbacks())
    expect(result.value).toBe('512 GB')
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('memory')
    expect(navigate).toHaveBeenCalledWith(ROUTES.COMPUTE)
  })

  it('storage: formats totalStorageGB and navigates to storage route', () => {
    const result = getClusterDashboardStatValue('storage', makeStats({ totalStorageGB: 2048 }), true, 10, callbacks())
    expect(result.value).toBe('2.0 TB')
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('storage')
    expect(navigate).toHaveBeenCalledWith(ROUTES.STORAGE)
  })

  it('gpus: is clickable only when hasData and totalGPUs > 0', () => {
    const withGpus = getClusterDashboardStatValue('gpus', makeStats({ totalGPUs: 4 }), true, 10, callbacks())
    expect(withGpus.isClickable).toBe(true)
    withGpus.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('gpu')
    expect(openGPUModal).toHaveBeenCalled()

    const noGpus = getClusterDashboardStatValue('gpus', makeStats({ totalGPUs: 0 }), true, 10, callbacks())
    expect(noGpus.isClickable).toBe(false)
  })

  it('pods: shows totalPods and navigates to workloads', () => {
    const result = getClusterDashboardStatValue('pods', makeStats(), true, 10, callbacks())
    expect(result.value).toBe(120)
    result.onClick?.()
    expect(mockEmit).toHaveBeenCalledWith('pods')
    expect(navigate).toHaveBeenCalledWith(ROUTES.WORKLOADS)
  })

  it('pods: shows dash when hasData is false', () => {
    const result = getClusterDashboardStatValue('pods', makeStats(), false, 10, callbacks())
    expect(result.value).toBe('-')
  })

  it('returns a dash placeholder for an unrecognized blockId', () => {
    const result = getClusterDashboardStatValue('unknown-block', makeStats(), true, 10, callbacks())
    expect(result).toEqual({ value: '-', sublabel: '' })
  })
})
