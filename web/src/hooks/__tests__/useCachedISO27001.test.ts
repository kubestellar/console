import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
  })),
}))

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [],
    isLoading: false,
  })),
}))

import { useCachedISO27001 } from '../useCachedISO27001'

describe('useCachedISO27001', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedISO27001())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
  })
})
