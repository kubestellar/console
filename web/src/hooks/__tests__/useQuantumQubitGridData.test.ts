import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useQuantumQubitGridData,
  DEMO_QUANTUM_QUBITS,
  DEMO_QUANTUM_STATUS,
} from '../useCachedQuantum'
import { useCache } from '../../lib/cache'

vi.mock('../../lib/cache', () => ({ useCache: vi.fn() }))
vi.mock('../../lib/quantum/pollingContext', () => ({
  isGlobalQuantumPollingPaused: vi.fn().mockReturnValue(false),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useQuantumQubitGridData', () => {
  it('returns disabled result with data null when isAuthenticated is false', () => {
    const mockRefetch = vi.fn()
    const noisyCacheData = {
      qubits: DEMO_QUANTUM_QUBITS,
      versionInfo: DEMO_QUANTUM_STATUS.version_info ?? null,
    }
    vi.mocked(useCache).mockReturnValue({
      data: noisyCacheData,
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
      useQuantumQubitGridData({ isAuthenticated: false }),
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

  it('maps DEMO_QUANTUM_QUBITS and version_info correctly in demo mode', () => {
    const demoData = {
      qubits: DEMO_QUANTUM_QUBITS,
      versionInfo: DEMO_QUANTUM_STATUS.version_info ?? null,
    }

    vi.mocked(useCache).mockReturnValueOnce({
      data: demoData,
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
    const { result: loadingResult } = renderHook(() =>
      useQuantumQubitGridData({ isAuthenticated: true }),
    )
    expect(loadingResult.current.isDemoData).toBe(false)

    vi.mocked(useCache).mockReturnValueOnce({
      data: demoData,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: true,
      isFailed: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() =>
      useQuantumQubitGridData({ isAuthenticated: true }),
    )

    expect(result.current.isDemoData).toBe(true)
    expect(result.current.data).not.toBeNull()
    expect(result.current.data?.qubits?.num_qubits).toBe(2)
    expect(result.current.data?.qubits?.pattern).toBe('00')
    expect(result.current.data?.versionInfo?.version).toBe('v0.2.58')
    expect(result.current.data?.versionInfo?.commit).toBe('demo')
  })
})
