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
    lastRefresh: null,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

import { useCachedProwJobs } from '../useCachedProw'

describe('useCachedProwJobs', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedProwJobs())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('jobs')
  })
})
