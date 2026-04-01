import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: { jobs: [], lastUpdated: null },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  })),
}))

import { useCachedProw } from '../useCachedProw'

describe('useCachedProw', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedProw())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
  })
})
