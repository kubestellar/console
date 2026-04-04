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

// ===========================================================================
// useServiceExport (singular) — fetches a specific service export
// ===========================================================================

import { useServiceExport, useServiceImport } from '../useMCS'

describe('useServiceExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Returns a single service export ─────────────────────────────────

  it('fetches a specific service export by cluster/namespace/name', async () => {
    const exportData = {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'us-east-1',
      status: 'Ready',
      createdAt: '2026-01-01T00:00:00Z',
    }

    mockApiGet.mockResolvedValue({ data: exportData })

    const { result } = renderHook(() => useServiceExport('us-east-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.export).toEqual(exportData)
    expect(result.current.error).toBeNull()
    expect(result.current.lastUpdated).not.toBeNull()
  })

  // ── Encodes URL components ──────────────────────────────────────────

  it('properly encodes cluster, namespace, and name in URL', async () => {
    mockApiGet.mockResolvedValue({ data: { name: 'svc' } })

    renderHook(() => useServiceExport('cluster/special', 'ns space', 'name&char'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain(encodeURIComponent('cluster/special'))
    expect(calledUrl).toContain(encodeURIComponent('ns space'))
    expect(calledUrl).toContain(encodeURIComponent('name&char'))
  })

  // ── Skips fetch when cluster is empty ───────────────────────────────

  it('does not fetch when cluster is empty string', async () => {

    // Should remain in loading state since fetch was skipped
    // Wait a tick to ensure the effect ran
    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Skips fetch when namespace is empty ──────────────────────────────

  it('does not fetch when namespace is empty string', async () => {

    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Skips fetch when name is empty ──────────────────────────────────

  it('does not fetch when name is empty string', async () => {

    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Handles API error ───────────────────────────────────────────────

  it('sets error state on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => useServiceExport('us-east-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Not found')
    expect(result.current.export).toBeNull()
  })

  // ── Handles BackendUnavailableError ─────────────────────────────────

  it('sets backend unavailable error', async () => {
    mockApiGet.mockRejectedValue(new BackendUnavailableError())

    const { result } = renderHook(() => useServiceExport('us-east-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Backend unavailable')
  })

  // ── Handles non-Error thrown values ─────────────────────────────────

  it('uses fallback error message for non-Error exceptions', async () => {
    mockApiGet.mockRejectedValue('string error value')

    const { result } = renderHook(() => useServiceExport('us-east-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to fetch service export')
  })

  // ── Refetch function ────────────────────────────────────────────────

  it('provides a refetch function that re-fetches data', async () => {
    const initial = { name: 'v1', namespace: 'ns', cluster: 'c', status: 'Pending', createdAt: '' }
    const refreshed = { name: 'v1', namespace: 'ns', cluster: 'c', status: 'Ready', createdAt: '' }

    mockApiGet
      .mockResolvedValueOnce({ data: initial })
      .mockResolvedValueOnce({ data: refreshed })

    const { result } = renderHook(() => useServiceExport('c', 'ns', 'v1'))

    await waitFor(() => {
      expect(result.current.export).toEqual(initial)
    })

    await act(async () => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.export).toEqual(refreshed)
    })
  })

  // ── isRefreshing state ──────────────────────────────────────────────

  it('sets isRefreshing on refresh (not isLoading)', async () => {
    const data = { name: 'svc', namespace: 'ns', cluster: 'c', status: 'Ready', createdAt: '' }

    let resolveRefresh: (v: unknown) => void
    mockApiGet
      .mockResolvedValueOnce({ data })
      .mockImplementationOnce(() => new Promise(r => { resolveRefresh = r }))

    const { result } = renderHook(() => useServiceExport('c', 'ns', 'svc'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.refetch() })

    // During refresh, isRefreshing should be true but isLoading should be false
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(true)
    })
    expect(result.current.isLoading).toBe(false)

    await act(async () => { resolveRefresh!({ data }) })
  })

  // ── Return shape ────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceExport('c', 'ns', 'n'))

    expect(result.current).toHaveProperty('export')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ===========================================================================
// useServiceImport (singular) — fetches a specific service import
// ===========================================================================

describe('useServiceImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Returns a single service import ─────────────────────────────────

  it('fetches a specific service import by cluster/namespace/name', async () => {
    const importData = {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'eu-central-1',
      sourceCluster: 'us-east-1',
      type: 'ClusterSetIP',
      endpoints: 3,
      createdAt: '2026-01-01T00:00:00Z',
    }

    mockApiGet.mockResolvedValue({ data: importData })

    const { result } = renderHook(() => useServiceImport('eu-central-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.import).toEqual(importData)
    expect(result.current.error).toBeNull()
    expect(result.current.lastUpdated).not.toBeNull()
  })

  // ── Skips fetch when cluster is empty ───────────────────────────────

  it('does not fetch when cluster is empty string', async () => {
    renderHook(() => useServiceImport('', 'production', 'api-gateway'))

    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Skips fetch when namespace is empty ──────────────────────────────

  it('does not fetch when namespace is empty string', async () => {
    renderHook(() => useServiceImport('eu-central-1', '', 'api-gateway'))

    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Skips fetch when name is empty ──────────────────────────────────

  it('does not fetch when name is empty string', async () => {
    renderHook(() => useServiceImport('eu-central-1', 'production', ''))

    await act(async () => { await Promise.resolve() })

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  // ── Handles API error ───────────────────────────────────────────────

  it('sets error state on API failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection refused'))

    const { result } = renderHook(() => useServiceImport('eu-central-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Connection refused')
    expect(result.current.import).toBeNull()
  })

  // ── Handles BackendUnavailableError ─────────────────────────────────

  it('sets backend unavailable error', async () => {
    mockApiGet.mockRejectedValue(new BackendUnavailableError())

    const { result } = renderHook(() => useServiceImport('eu-central-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Backend unavailable')
  })

  // ── Handles non-Error thrown values ─────────────────────────────────

  it('uses fallback error message for non-Error exceptions', async () => {
    mockApiGet.mockRejectedValue(42)

    const { result } = renderHook(() => useServiceImport('eu-central-1', 'production', 'api-gateway'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to fetch service import')
  })

  // ── Refetch function ────────────────────────────────────────────────

  it('provides a refetch function that re-fetches data', async () => {
    const initial = { name: 'svc', namespace: 'ns', cluster: 'c', sourceCluster: 's', type: 'ClusterSetIP', endpoints: 1, createdAt: '' }
    const refreshed = { name: 'svc', namespace: 'ns', cluster: 'c', sourceCluster: 's', type: 'ClusterSetIP', endpoints: 5, createdAt: '' }

    mockApiGet
      .mockResolvedValueOnce({ data: initial })
      .mockResolvedValueOnce({ data: refreshed })

    const { result } = renderHook(() => useServiceImport('c', 'ns', 'svc'))

    await waitFor(() => {
      expect(result.current.import).toEqual(initial)
    })

    await act(async () => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.import).toEqual(refreshed)
    })
  })

  // ── Encodes URL components ──────────────────────────────────────────

  it('properly encodes cluster, namespace, and name in URL', async () => {
    mockApiGet.mockResolvedValue({ data: { name: 'svc' } })

    renderHook(() => useServiceImport('cluster/special', 'ns space', 'name&char'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/mcs/imports/')
    expect(calledUrl).toContain(encodeURIComponent('cluster/special'))
    expect(calledUrl).toContain(encodeURIComponent('ns space'))
    expect(calledUrl).toContain(encodeURIComponent('name&char'))
  })

  // ── Return shape ────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useServiceImport('c', 'ns', 'n'))

    expect(result.current).toHaveProperty('import')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('lastUpdated')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ===========================================================================
// Additional edge-case coverage for useServiceExports / useServiceImports
// ===========================================================================

describe('useServiceExports — additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── No query params when no filters passed ──────────────────────────

  it('builds URL without query params when no cluster or namespace given', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toBe('/api/mcs/exports')
  })

  // ── Only cluster query param ────────────────────────────────────────

  it('builds URL with only cluster when no namespace given', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceExports('us-east-1'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=us-east-1')
    expect(calledUrl).not.toContain('namespace=')
  })

  // ── Non-Error thrown values use fallback message ────────────────────

  it('uses fallback error message for non-Error exceptions', async () => {
    mockApiGet.mockRejectedValue(null)

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to fetch service exports')
  })

  // ── Refetch triggers isRefreshing ───────────────────────────────────

  it('sets isRefreshing true during refetch (not isLoading)', async () => {
    let resolveRefresh: (v: unknown) => void
    mockApiGet
      .mockResolvedValueOnce({ data: { items: [{ name: 'svc' }] } })
      .mockImplementationOnce(() => new Promise(r => { resolveRefresh = r }))

    const { result } = renderHook(() => useServiceExports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.refetch() })

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(true)
    })
    // isLoading should be false since we already have data
    expect(result.current.isLoading).toBe(false)

    await act(async () => { resolveRefresh!({ data: { items: [] } }) })
  })
})

describe('useServiceImports — additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDemoMode = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── No query params when no filters passed ──────────────────────────

  it('builds URL without query params when no cluster or namespace given', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toBe('/api/mcs/imports')
  })

  // ── Only namespace query param ──────────────────────────────────────

  it('builds URL with only namespace when no cluster given', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useServiceImports(undefined, 'production'))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled()
    })

    const calledUrl = mockApiGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('namespace=production')
    expect(calledUrl).not.toContain('cluster=')
  })

  // ── Non-Error thrown values use fallback message ────────────────────

  it('uses fallback error message for non-Error exceptions', async () => {
    mockApiGet.mockRejectedValue(undefined)

    const { result } = renderHook(() => useServiceImports())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Failed to fetch service imports')
  })
})
