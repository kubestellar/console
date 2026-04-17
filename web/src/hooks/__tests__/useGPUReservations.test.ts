import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: vi.fn(() => false),
}))

vi.mock('../useBackendHealth', () => ({
  isInClusterMode: vi.fn(() => false),
}))

import { useGPUReservations, normalizeGpuTypes } from '../useGPUReservations'
import type { GPUReservation, CreateGPUReservationInput } from '../useGPUReservations'

// ============================================================================
// Helpers
// ============================================================================

const MOCK_RESERVATION: GPUReservation = {
  id: 'res-1',
  user_id: 'user-1',
  user_name: 'alice',
  title: 'Training Run',
  description: 'Fine-tuning model',
  cluster: 'eks-prod',
  namespace: 'ml',
  gpu_count: 4,
  gpu_type: 'NVIDIA A100',
  start_date: '2024-01-15',
  duration_hours: 24,
  notes: '',
  status: 'active',
  quota_name: '',
  quota_enforced: false,
  created_at: new Date().toISOString(),
}

const MOCK_CREATE_INPUT: CreateGPUReservationInput = {
  title: 'New Job',
  cluster: 'eks-prod',
  namespace: 'ml',
  gpu_count: 8,
  start_date: '2024-02-01',
}

// ============================================================================
// Tests
// ============================================================================

describe('useGPUReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockGet.mockResolvedValue({ data: [] })
    mockPost.mockResolvedValue({ data: MOCK_RESERVATION })
    mockPut.mockResolvedValue({ data: MOCK_RESERVATION })
    mockDelete.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------- Shape & Defaults ----------

  it('returns the expected return shape', async () => {
    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current).toHaveProperty('reservations')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('createReservation')
    expect(result.current).toHaveProperty('updateReservation')
    expect(result.current).toHaveProperty('deleteReservation')
    expect(typeof result.current.refetch).toBe('function')
    expect(typeof result.current.createReservation).toBe('function')
    expect(typeof result.current.updateReservation).toBe('function')
    expect(typeof result.current.deleteReservation).toBe('function')
  })

  it('starts in loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useGPUReservations())
    expect(result.current.isLoading).toBe(true)
  })

  // ---------- Happy Path: Fetch ----------

  it('fetches reservations on mount', async () => {
    mockGet.mockResolvedValue({ data: [MOCK_RESERVATION] })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reservations).toHaveLength(1)
    expect(result.current.reservations[0].id).toBe('res-1')
    expect(result.current.error).toBeNull()
  })

  it('passes mine=true query when onlyMine is true', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useGPUReservations(true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockGet).toHaveBeenCalledWith('/api/gpu/reservations?mine=true')
  })

  it('does not pass query param when onlyMine is false', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useGPUReservations(false))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockGet).toHaveBeenCalledWith('/api/gpu/reservations')
  })

  it('handles non-array API response by defaulting to empty array', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reservations).toEqual([])
  })

  // ---------- Error Handling ----------

  it('sets error on API failure in non-demo mode', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Network error')
  })

  it('handles non-Error thrown objects', async () => {
    mockGet.mockRejectedValue('string error')

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to fetch reservations')
  })

  // ---------- Demo Mode ----------

  it('falls back to demo data when API fails in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockGet.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reservations.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('uses demo data when API returns empty in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reservations.length).toBeGreaterThan(0)
    expect(result.current.reservations[0].id).toMatch(/^demo-/)
  })

  it('uses live data in demo mode when API returns non-empty', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockGet.mockResolvedValue({ data: [MOCK_RESERVATION] })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reservations).toHaveLength(1)
    expect(result.current.reservations[0].id).toBe('res-1')
  })

  // ---------- CRUD Operations ----------

  it('createReservation calls POST and triggers refresh', async () => {
    const created = { ...MOCK_RESERVATION, id: 'res-new' }
    mockPost.mockResolvedValue({ data: created })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callsBefore = mockGet.mock.calls.length

    let returnVal: GPUReservation | undefined
    await act(async () => {
      returnVal = await result.current.createReservation(MOCK_CREATE_INPUT)
    })

    expect(returnVal?.id).toBe('res-new')
    expect(mockPost).toHaveBeenCalledWith('/api/gpu/reservations', MOCK_CREATE_INPUT)
    // Should trigger a silent refresh
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('updateReservation calls PUT and triggers refresh', async () => {
    const updated = { ...MOCK_RESERVATION, title: 'Updated' }
    mockPut.mockResolvedValue({ data: updated })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let returnVal: GPUReservation | undefined
    await act(async () => {
      returnVal = await result.current.updateReservation('res-1', { title: 'Updated' })
    })

    expect(returnVal?.title).toBe('Updated')
    expect(mockPut).toHaveBeenCalledWith('/api/gpu/reservations/res-1', { title: 'Updated' })
  })

  it('deleteReservation calls DELETE and triggers refresh', async () => {
    mockDelete.mockResolvedValue({})

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callsBefore = mockGet.mock.calls.length

    await act(async () => {
      await result.current.deleteReservation('res-1')
    })

    expect(mockDelete).toHaveBeenCalledWith('/api/gpu/reservations/res-1')
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ---------- Polling & Cleanup ----------

  it('polls every REFRESH_INTERVAL_MS and cleans up on unmount', async () => {
    const REFRESH_INTERVAL_MS = 30_000
    mockGet.mockResolvedValue({ data: [] })

    const { result, unmount } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callsAfterMount = mockGet.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsAfterMount)

    unmount()
    const callsAfterUnmount = mockGet.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    expect(mockGet.mock.calls.length).toBe(callsAfterUnmount)
  })

  // ---------- Refetch ----------

  it('refetch re-fetches data and exits loading state', async () => {
    mockGet.mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockGet.mockResolvedValue({ data: [MOCK_RESERVATION] })

    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.reservations).toHaveLength(1))
  })

  // ---------- Edge Cases ----------

  it('handles API returning an object instead of an array', async () => {
    mockGet.mockResolvedValue({ data: { reservations: [] } })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Non-array data should be replaced with empty array
    expect(result.current.reservations).toEqual([])
  })

  it('does not show loading spinner on silent refresh', async () => {
    mockGet.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Let the interval fire a silent poll
    const REFRESH_INTERVAL_MS = 30_000
    mockGet.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: [MOCK_RESERVATION] }), 100)
    }))

    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    // isLoading should stay false during silent refresh
    expect(result.current.isLoading).toBe(false)
  })

  it('clears error after a successful fetch following a failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useGPUReservations())
    await waitFor(() => expect(result.current.error).toBe('fail'))

    mockGet.mockResolvedValue({ data: [] })
    await act(async () => { result.current.refetch() })
    await waitFor(() => expect(result.current.error).toBeNull())
  })
})

// Multi-type GPU reservations. These tests pin the front-end
// reconciliation helper used everywhere the UI needs to know the
// canonical list of accepted GPU types for a reservation.
describe('normalizeGpuTypes (gpu-multitype)', () => {
  it('returns the multi-type list when gpu_types is populated', () => {
    const r = { gpu_type: 'NVIDIA A100', gpu_types: ['NVIDIA A100', 'NVIDIA H100'] }
    expect(normalizeGpuTypes(r)).toEqual(['NVIDIA A100', 'NVIDIA H100'])
  })

  it('promotes legacy gpu_type to a one-element list when gpu_types is missing', () => {
    const r = { gpu_type: 'NVIDIA A100', gpu_types: undefined }
    expect(normalizeGpuTypes(r)).toEqual(['NVIDIA A100'])
  })

  it('returns an empty array when neither field is set', () => {
    expect(normalizeGpuTypes({ gpu_type: '', gpu_types: undefined })).toEqual([])
    expect(normalizeGpuTypes(null)).toEqual([])
    expect(normalizeGpuTypes(undefined)).toEqual([])
  })

  it('deduplicates entries while preserving first-seen order', () => {
    const r = { gpu_type: '', gpu_types: ['A100', '', 'A100', 'H100', 'A100'] }
    expect(normalizeGpuTypes(r)).toEqual(['A100', 'H100'])
  })
})
