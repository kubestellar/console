import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useQuantumCircuitAscii,
  DEMO_QUANTUM_CIRCUIT,
  QUANTUM_CIRCUIT_DEFAULT_POLL_MS,
} from '../useCachedQuantum'
import { useCache } from '../../lib/cache'

vi.mock('../../lib/cache', () => ({ useCache: vi.fn() }))
vi.mock('../../lib/quantum/pollingContext', () => ({
  isGlobalQuantumPollingPaused: vi.fn().mockReturnValue(false),
}))

const MOCK_CACHE_ERROR_MESSAGE = 'cache fetch failed'
const MOCK_CONSECUTIVE_FAILURES = 5
const MOCK_LAST_REFRESH_MS = 123456789

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useQuantumCircuitAscii', () => {
  it('returns disabled result with data null when isAuthenticated is false', () => {
    const mockRefetch = vi.fn()
    vi.mocked(useCache).mockReturnValue({
      data: DEMO_QUANTUM_CIRCUIT,
      isLoading: true,
      isRefreshing: true,
      isDemoFallback: true,
      isFailed: true,
      error: MOCK_CACHE_ERROR_MESSAGE,
      consecutiveFailures: MOCK_CONSECUTIVE_FAILURES,
      lastRefresh: MOCK_LAST_REFRESH_MS,
      refetch: mockRefetch,
      retryFetch: vi.fn(),
      clearAndRefetch: vi.fn(),
    })

    const { result } = renderHook(() =>
      useQuantumCircuitAscii({ isAuthenticated: false }),
    )

    expect(vi.mocked(useCache).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        key: 'quantum-circuit-ascii',
        category: 'realtime',
        refreshInterval: QUANTUM_CIRCUIT_DEFAULT_POLL_MS,
        autoRefresh: true,
        enabled: false,
        initialData: null,
        demoData: DEMO_QUANTUM_CIRCUIT,
        fetcher: expect.any(Function),
      }),
    )

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.lastRefresh).toBeNull()
    expect(result.current.refetch).toBe(mockRefetch)
  })

  it('returns DEMO_QUANTUM_CIRCUIT and isDemoData true in demo mode', () => {
    vi.mocked(useCache).mockReturnValueOnce({
      data: DEMO_QUANTUM_CIRCUIT,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
      retryFetch: vi.fn(),
      clearAndRefetch: vi.fn(),
    })

    const { result } = renderHook(() =>
      useQuantumCircuitAscii({ isAuthenticated: true }),
    )

    expect(vi.mocked(useCache).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        key: 'quantum-circuit-ascii',
        enabled: true,
        demoData: DEMO_QUANTUM_CIRCUIT,
      }),
    )

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.data).toEqual(DEMO_QUANTUM_CIRCUIT)
  })

  it('sets isDemoData false when isDemoFallback true and isLoading true', () => {
    vi.mocked(useCache).mockReturnValueOnce({
      data: DEMO_QUANTUM_CIRCUIT,
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
      retryFetch: vi.fn(),
      clearAndRefetch: vi.fn(),
    })

    const { result } = renderHook(() =>
      useQuantumCircuitAscii({ isAuthenticated: true }),
    )

    expect(result.current.isDemoData).toBe(false)
  })

  it('disables cache when forceDemo is true even if authenticated', () => {
    renderHook(() =>
      useQuantumCircuitAscii({
        isAuthenticated: true,
        forceDemo: true,
      }),
    )

    expect(vi.mocked(useCache).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        enabled: false,
      }),
    )
  })
})
