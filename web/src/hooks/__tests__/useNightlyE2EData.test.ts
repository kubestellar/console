import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: { guides: [], isDemo: true },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: true,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
  isDemoMode: () => true,
  getDemoMode: () => true,
}))

vi.mock('../../lib/llmd/nightlyE2EDemoData', () => ({
  generateDemoNightlyData: () => [],
}))

import { useNightlyE2EData } from '../useNightlyE2EData'

describe('useNightlyE2EData', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('guides')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('refetch')
  })

  it('does not throw on mount', () => {
    expect(() => renderHook(() => useNightlyE2EData())).not.toThrow()
  })
})
