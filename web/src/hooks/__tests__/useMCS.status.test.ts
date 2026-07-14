/**
 * Tests for useMCSStatus hook.
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
import { useMCSStatus } from '../useMCS'
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
