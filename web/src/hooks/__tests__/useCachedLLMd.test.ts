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

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

import { useCachedLLMd } from '../useCachedLLMd'

describe('useCachedLLMd', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedLLMd())
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
  })
})
