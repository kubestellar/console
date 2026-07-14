/**
 * Tests for useServiceImports and useServiceImport hooks.
 *
 * Validates data fetching, loading states, error handling, demo mode
 * fallback, polling behaviour, URL encoding, and additional edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before module import
// ---------------------------------------------------------------------------

let mockDemoMode = false

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockDemoMode }),
  getDemoMode: vi.fn(() => false),
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
import { useServiceImports, useServiceImport } from '../useMCS'
import { BackendUnavailableError } from '../../lib/api'

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
// Additional edge-case coverage for useServiceImports
// ===========================================================================

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
