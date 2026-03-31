/**
 * Tests for useMCS hooks: useMCSStatus, useServiceExports, useServiceImports.
 *
 * Validates data fetching, loading states, error handling, demo mode
 * fallback, and polling behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before module import
// ---------------------------------------------------------------------------

let mockDemoMode = false

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockDemoMode }),
}))

const mockApiGet = vi.fn()

vi.mock('../../lib/api', () => {
  // BackendUnavailableError must be defined inside the factory because
  // vi.mock is hoisted — referencing outer variables causes ReferenceError.
  class BackendUnavailableError extends Error {
    constructor() {
      super('Backend API is currently unavailable')
      this.name = 'BackendUnavailableError'
    }
  }

  return {
    api: {
      get: (...args: unknown[]) => mockApiGet(...args),
    },
    BackendUnavailableError,
  }
})

// Import after mocks
import { useMCSStatus, useServiceExports, useServiceImports } from '../useMCS'
import { BackendUnavailableError } from '../../lib/api'

describe('useMCSStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initial loading state ──────────────────────────────────────────────

  it('starts in loading state', () => {
    // Make the API call hang so we can observe loading state
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useMCSStatus())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.clusters).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // ── Returns MCS status data ────────────────────────────────────────────

  it('returns clusters from the MCS status API', async () => {
    const clusterData = [
      { cluster: 'us-east-1', mcsAvailable: true },
      { cluster: 'eu-central-1', mcsAvailable: false },
    ]

    mockApiGet.mockResolvedValue({ data: { clusters: clusterData } })

    const { result } = renderHook(() => useMCSStatus())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.clusters).toEqual(clusterData)
    expect(result.current.error).toBeNull()
    expect(result.current.lastUpdated).not.toBeNull()
  })

  // ── Handles API errors ─────────────────────────────────────────────────

  it('sets error state on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useMCSStatus())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.clusters).toEqual([])
  })

  // ── Handles BackendUnavailableError ────────────────────────────────────

  it('sets backend unavailable error', async () => {
    mockApiGet.mockRejectedValue(new BackendUnavailableError())

    const { result } = renderHook(() => useMCSStatus())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Backend unavailable')
  })

  // ── Demo mode returns empty clusters ───────────────────────────────────

  it('returns empty clusters in demo mode without calling API', async () => {
    mockDemoMode = true

    const { result } = renderHook(() => useMCSStatus())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.clusters).toEqual([])
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Refetch function ───────────────────────────────────────────────────

  it('provides a refetch function that re-fetches data', async () => {
    const initialData = [{ cluster: 'c1', mcsAvailable: true }]
    const refreshedData = [
      { cluster: 'c1', mcsAvailable: true },
      { cluster: 'c2', mcsAvailable: true },
    ]

    mockApiGet
      .mockResolvedValueOnce({ data: { clusters: initialData } })
      .mockResolvedValueOnce({ data: { clusters: refreshedData } })

    const { result } = renderHook(() => useMCSStatus())

    await waitFor(() => {
      expect(result.current.clusters).toEqual(initialData)
    })

    await act(async () => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.clusters).toEqual(refreshedData)
    })
  })

  // ── Return shape ───────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useMCSStatus())

    expect(result.current).toHaveProperty('clusters')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('useServiceExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initial loading state ──────────────────────────────────────────────

  it('starts in loading state', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceExports())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.exports).toEqual([])
    expect(result.current.totalCount).toBe(0)
  })

  // ── Returns service exports ────────────────────────────────────────────

  it('returns service exports from the API', async () => {
    const items = [
      {
        name: 'api-gateway',
        namespace: 'production',
        cluster: 'us-east-1',
        status: 'Ready',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]

    mockApiGet.mockResolvedValue({ data: { items } })

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.exports).toEqual(items)
    expect(result.current.totalCount).toBe(1)
    expect(result.current.error).toBeNull()
  })

  // ── Passes cluster and namespace filters ───────────────────────────────

  it('passes cluster and namespace query params to the API', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceExports('us-east-1', 'production'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=us-east-1')
    expect(calledUrl).toContain('namespace=production')
  })

  // ── Handles API errors ─────────────────────────────────────────────────

  it('sets error on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Timeout'))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Timeout')
    expect(result.current.exports).toEqual([])
  })

  // ── Handles BackendUnavailableError ────────────────────────────────────

  it('sets backend unavailable error', async () => {
    mockApiGet.mockRejectedValue(new BackendUnavailableError())

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Backend unavailable')
  })

  // ── Demo mode returns demo exports ─────────────────────────────────────

  it('returns demo data in demo mode without calling API', async () => {
    mockDemoMode = true

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should have demo data (3 items based on DEMO_SERVICE_EXPORTS)
    expect(result.current.exports.length).toBeGreaterThan(0)
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Polls at REFRESH_INTERVAL_MS ───────────────────────────────────────

  it('polls for updates at the configured interval', async () => {
    const REFRESH_INTERVAL_MS = 120000

    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceExports())

    // Flush the initial fetch
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const initialCallCount = mockApiGet.mock.calls.length

    // Advance past one poll interval
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(initialCallCount)

    vi.useRealTimers()
  })

  // ── Cleans up polling on unmount ───────────────────────────────────────

  it('stops polling on unmount', async () => {
    const REFRESH_INTERVAL_MS = 120000

    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    const { unmount } = renderHook(() => useServiceExports())

    // Flush the initial fetch
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const callCountBefore = mockApiGet.mock.calls.length
    unmount()

    // Advance past several poll intervals
    const MANY_INTERVALS = 3
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * MANY_INTERVALS)
    })

    // No additional calls after unmount
    expect(mockApiGet.mock.calls.length).toBe(callCountBefore)

    vi.useRealTimers()
  })

  // ── Return shape ───────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceExports())

    expect(result.current).toHaveProperty('exports')
    expect(result.current).toHaveProperty('totalCount')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})

describe('useServiceImports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initial loading state ──────────────────────────────────────────────

  it('starts in loading state', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceImports())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.imports).toEqual([])
    expect(result.current.totalCount).toBe(0)
  })

  // ── Returns service imports ────────────────────────────────────────────

  it('returns service imports from the API', async () => {
    const items = [
      {
        name: 'api-gateway',
        namespace: 'production',
        cluster: 'eu-central-1',
        sourceCluster: 'us-east-1',
        type: 'ClusterSetIP',
        endpoints: 3,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]

    mockApiGet.mockResolvedValue({ data: { items } })

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.imports).toEqual(items)
    expect(result.current.totalCount).toBe(1)
    expect(result.current.error).toBeNull()
  })

  // ── Passes cluster and namespace filters ───────────────────────────────

  it('passes cluster and namespace query params to the API', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceImports('eu-central-1', 'production'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=eu-central-1')
    expect(calledUrl).toContain('namespace=production')
  })

  // ── Handles API errors ─────────────────────────────────────────────────

  it('sets error on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Server error')
    expect(result.current.imports).toEqual([])
  })

  // ── Handles BackendUnavailableError ────────────────────────────────────

  it('sets backend unavailable error', async () => {
    mockApiGet.mockRejectedValue(new BackendUnavailableError())

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Backend unavailable')
  })

  // ── Demo mode returns demo imports ─────────────────────────────────────

  it('returns demo data in demo mode without calling API', async () => {
    mockDemoMode = true

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Should have demo data (2 items based on DEMO_SERVICE_IMPORTS)
    expect(result.current.imports.length).toBeGreaterThan(0)
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Polls at REFRESH_INTERVAL_MS ───────────────────────────────────────

  it('polls for updates at the configured interval', async () => {
    const REFRESH_INTERVAL_MS = 120000

    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceImports())

    // Flush the initial fetch
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const initialCallCount = mockApiGet.mock.calls.length

    // Advance past one poll interval
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(initialCallCount)

    vi.useRealTimers()
  })

  // ── Cleans up polling on unmount ───────────────────────────────────────

  it('stops polling on unmount', async () => {
    const REFRESH_INTERVAL_MS = 120000

    vi.useFakeTimers()
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    const { unmount } = renderHook(() => useServiceImports())

    // Flush the initial fetch
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const callCountBefore = mockApiGet.mock.calls.length
    unmount()

    // Advance past several poll intervals
    const MANY_INTERVALS = 3
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * MANY_INTERVALS)
    })

    // No additional calls after unmount
    expect(mockApiGet.mock.calls.length).toBe(callCountBefore)

    vi.useRealTimers()
  })

  // ── Handles empty response ─────────────────────────────────────────────

  it('handles empty items response gracefully', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.imports).toEqual([])
    expect(result.current.totalCount).toBe(0)
    expect(result.current.error).toBeNull()
  })

  // ── Return shape ───────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceImports())

    expect(result.current).toHaveProperty('imports')
    expect(result.current).toHaveProperty('totalCount')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})
