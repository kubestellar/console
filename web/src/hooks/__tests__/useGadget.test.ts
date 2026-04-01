import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: { available: false },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useGadgetStatus, useCachedNetworkTraces, useCachedDNSTraces, useCachedProcessTraces, useCachedSecurityAudit } from '../useGadget'

describe('useGadgetStatus', () => {
  it('returns status and loading state', () => {
    const { result } = renderHook(() => useGadgetStatus())
    expect(result.current.status).toHaveProperty('available')
    expect(typeof result.current.isLoading).toBe('boolean')
  })
})

describe('useCachedNetworkTraces', () => {
  it('returns data array and loading state', () => {
    const { result } = renderHook(() => useCachedNetworkTraces())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
  })

  it('accepts cluster and namespace params', () => {
    const { result } = renderHook(() => useCachedNetworkTraces('prod', 'default'))
    expect(result.current).toHaveProperty('data')
  })
})

describe('useCachedDNSTraces', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedDNSTraces())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
  })
})

describe('useCachedProcessTraces', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedProcessTraces())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
  })
})

describe('useCachedSecurityAudit', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useCachedSecurityAudit())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
  })
})
