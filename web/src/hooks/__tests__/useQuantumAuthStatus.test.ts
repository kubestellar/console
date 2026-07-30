import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/cache', () => ({ useCache: vi.fn() }))
vi.mock('../../lib/quantum/pollingContext', () => ({
  isGlobalQuantumPollingPaused: vi.fn().mockReturnValue(false),
}))

import { useQuantumAuthStatus } from '../useCachedQuantum'
import { useCache } from '../../lib/cache'

const mockRefetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useQuantumAuthStatus', () => {
  it('returns disabled result with authenticated:false when isAuthenticated is false', () => {
    vi.mocked(useCache).mockReturnValue({
      data: { authenticated: true },
      isLoading: true,
      isRefreshing: true,
      isDemoFallback: true,
      isFailed: true,
      error: 'cache fetch failed',
      consecutiveFailures: 5,
      lastRefresh: 123456789,
      refetch: mockRefetch,
    })

    const { result } = renderHook(() =>
      useQuantumAuthStatus({ isAuthenticated: false }),
    )

    expect(result.current.data).toEqual({
      authenticated: false,
      tokenStored: false,
      lastIbmError: null,
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.lastRefresh).toBeNull()
    expect(result.current.refetch).toBe(mockRefetch)
  })

  it('sets isDemoData=true only when isDemoFallback=true AND isLoading=false', () => {
    // Case A: isDemoFallback=true, isLoading=true → isDemoData false
    vi.mocked(useCache).mockReturnValueOnce({
      data: { authenticated: false },
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
    const { result: r1 } = renderHook(() =>
      useQuantumAuthStatus({ isAuthenticated: true }),
    )
    expect(r1.current.isDemoData).toBe(false)

    // Case B: isDemoFallback=true, isLoading=false → isDemoData true
    vi.mocked(useCache).mockReturnValueOnce({
      data: { authenticated: false },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
    const { result: r2 } = renderHook(() =>
      useQuantumAuthStatus({ isAuthenticated: true }),
    )
    expect(r2.current.isDemoData).toBe(true)

    // Case C: isDemoFallback=false, isLoading=false → isDemoData false
    vi.mocked(useCache).mockReturnValueOnce({
      data: { authenticated: true },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
    const { result: r3 } = renderHook(() =>
      useQuantumAuthStatus({ isAuthenticated: true }),
    )
    expect(r3.current.isDemoData).toBe(false)
  })
})
