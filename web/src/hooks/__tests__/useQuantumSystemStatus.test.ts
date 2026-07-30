import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useQuantumSystemStatus, DEMO_QUANTUM_STATUS } from '../useCachedQuantum'
import { useCache } from '../../lib/cache'

vi.mock('../../lib/cache', () => ({ useCache: vi.fn() }))
vi.mock('../../lib/quantum/pollingContext', () => ({
  isGlobalQuantumPollingPaused: vi.fn().mockReturnValue(false),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useQuantumSystemStatus', () => {
  it('returns disabled result when isAuthenticated is false', () => {
    const mockRefetch = vi.fn()
    vi.mocked(useCache).mockReturnValue({
      data: DEMO_QUANTUM_STATUS,
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
      useQuantumSystemStatus({ isAuthenticated: false }),
    )

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.lastRefresh).toBeNull()
    expect(typeof result.current.refetch).toBe('function')
  })

  it('sets isDemoData=true only when isDemoFallback=true AND isLoading=false', () => {
    vi.mocked(useCache).mockReturnValueOnce({
      data: DEMO_QUANTUM_STATUS,
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
      useQuantumSystemStatus({ isAuthenticated: true }),
    )
    expect(r1.current.isDemoData).toBe(false)

    vi.mocked(useCache).mockReturnValueOnce({
      data: DEMO_QUANTUM_STATUS,
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
      useQuantumSystemStatus({ isAuthenticated: true }),
    )
    expect(r2.current.isDemoData).toBe(true)

    vi.mocked(useCache).mockReturnValueOnce({
      data: null,
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
      useQuantumSystemStatus({ isAuthenticated: true }),
    )
    expect(r3.current.isDemoData).toBe(false)
  })
})
