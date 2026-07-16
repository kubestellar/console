import { describe, it, expect } from 'vitest'
import {
  getUtilizationColor,
  countActiveDays,
  computeAvgUtilization,
  SPARKLINE_HIGH_UTIL_PCT,
  SPARKLINE_LOW_UTIL_PCT,
} from '../gpu-constants'
import type { GPUUtilizationSnapshot } from '../../../hooks/useGPUUtilizations'

const makeSnapshot = (overrides: Partial<GPUUtilizationSnapshot> = {}): GPUUtilizationSnapshot => ({
  id: 'snap-1',
  reservation_id: 'res-1',
  timestamp: '2024-01-15T10:00:00Z',
  gpu_utilization_pct: 50,
  memory_utilization_pct: 30,
  active_gpu_count: 1,
  total_gpu_count: 4,
  ...overrides,
})

describe('getUtilizationColor', () => {
  it('returns green when utilization is at or above the high threshold', () => {
    expect(getUtilizationColor(SPARKLINE_HIGH_UTIL_PCT)).toBe('#22c55e')
    expect(getUtilizationColor(100)).toBe('#22c55e')
  })

  it('returns yellow when utilization is between low and high thresholds', () => {
    expect(getUtilizationColor(SPARKLINE_LOW_UTIL_PCT)).toBe('#eab308')
    expect(getUtilizationColor(50)).toBe('#eab308')
  })

  it('returns red when utilization is below the low threshold', () => {
    expect(getUtilizationColor(0)).toBe('#ef4444')
    expect(getUtilizationColor(SPARKLINE_LOW_UTIL_PCT - 1)).toBe('#ef4444')
  })
})

describe('countActiveDays', () => {
  it('returns 0 for an empty snapshot array', () => {
    expect(countActiveDays([])).toBe(0)
  })

  it('returns 0 when no snapshots have active GPUs', () => {
    const snapshots = [
      makeSnapshot({ active_gpu_count: 0, timestamp: '2024-01-15T10:00:00Z' }),
      makeSnapshot({ active_gpu_count: 0, timestamp: '2024-01-16T10:00:00Z' }),
    ]
    expect(countActiveDays(snapshots)).toBe(0)
  })

  it('counts unique calendar days with active GPUs', () => {
    const snapshots = [
      makeSnapshot({ active_gpu_count: 2, timestamp: '2024-01-15T08:00:00Z' }),
      makeSnapshot({ active_gpu_count: 1, timestamp: '2024-01-15T14:00:00Z' }), // same day
      makeSnapshot({ active_gpu_count: 3, timestamp: '2024-01-16T10:00:00Z' }),
      makeSnapshot({ active_gpu_count: 0, timestamp: '2024-01-17T10:00:00Z' }), // inactive
    ]
    expect(countActiveDays(snapshots)).toBe(2)
  })
})

describe('computeAvgUtilization', () => {
  it('returns 0 for an empty snapshot array', () => {
    expect(computeAvgUtilization([])).toBe(0)
  })

  it('returns the rounded average of gpu_utilization_pct', () => {
    const snapshots = [
      makeSnapshot({ gpu_utilization_pct: 10 }),
      makeSnapshot({ gpu_utilization_pct: 20 }),
      makeSnapshot({ gpu_utilization_pct: 30 }),
    ]
    expect(computeAvgUtilization(snapshots)).toBe(20)
  })

  it('rounds fractional averages', () => {
    const snapshots = [
      makeSnapshot({ gpu_utilization_pct: 10 }),
      makeSnapshot({ gpu_utilization_pct: 11 }),
    ]
    // (10 + 11) / 2 = 10.5 → rounds to 11
    expect(computeAvgUtilization(snapshots)).toBe(11)
  })
})
