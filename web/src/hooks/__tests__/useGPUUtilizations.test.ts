import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

const mockGet = vi.fn()
const mockGetDemoMode = vi.fn(() => false)
const mockHasRealToken = vi.fn(() => true)

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockGetDemoMode() }),
  hasRealToken: () => mockHasRealToken(),
}))

import { useGPUUtilizations } from '../useGPUUtilizations'
import type { GPUUtilizationSnapshot } from '../useGPUUtilizations'

// ============================================================================
// Helpers
// ============================================================================

const MOCK_SNAPSHOT: GPUUtilizationSnapshot = {
  id: 'snap-1',
  reservation_id: 'res-1',
  timestamp: new Date().toISOString(),
  gpu_utilization_pct: 85,
  memory_utilization_pct: 60,
  active_gpu_count: 4,
  total_gpu_count: 8,
}

// ============================================================================
// Tests
// ============================================================================

describe('useGPUUtilizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGet.mockResolvedValue({ data: {} })
    mockGetDemoMode.mockReturnValue(false)
    mockHasRealToken.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------- Shape & Defaults ----------

  it('returns the expected return shape', () => {
    const { result } = renderHook(() => useGPUUtilizations([]))
    expect(result.current).toHaveProperty('utilizations')
    expect(result.current).toHaveProperty('isLoading')
    expect(typeof result.current.utilizations).toBe('object')
    expect(typeof result.current.isLoading).toBe('boolean')
  })

  // ---------- Empty IDs ----------

  it('returns empty utilizations when no IDs provided', () => {
    const { result } = renderHook(() => useGPUUtilizations([]))
    expect(result.current.utilizations).toEqual({})
    expect(result.current.isLoading).toBe(false)
  })

  it('does not call API when IDs array is empty', () => {
    renderHook(() => useGPUUtilizations([]))
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('skips auth-backed fetches in demo mode without a real token', () => {
    mockGetDemoMode.mockReturnValue(true)
    mockHasRealToken.mockReturnValue(false)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useGPUUtilizations(['res-1']))

    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.utilizations).toEqual({})
    expect(result.current.error).toBeNull()
    expect(result.current.isFailed).toBe(false)
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  // ---------- Happy Path ----------

  it('fetches data for provided reservation IDs', async () => {
    mockGet.mockResolvedValue({
      data: { 'res-1': [MOCK_SNAPSHOT] },
    })

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.utilizations).toHaveProperty('res-1')
    expect(result.current.utilizations['res-1']).toHaveLength(1)
    expect(result.current.utilizations['res-1'][0].gpu_utilization_pct).toBe(85)
  })

  it('passes IDs as comma-separated query parameter', async () => {
    mockGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useGPUUtilizations(['res-1', 'res-2', 'res-3']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('ids=res-1%2Cres-2%2Cres-3'),
      expect.objectContaining({ timeout: expect.any(Number) })
    )
  })

  it('fetches data for multiple reservation IDs', async () => {
    const snap2: GPUUtilizationSnapshot = { ...MOCK_SNAPSHOT, id: 'snap-2', reservation_id: 'res-2' }
    mockGet.mockResolvedValue({
      data: { 'res-1': [MOCK_SNAPSHOT], 'res-2': [snap2] },
    })

    const { result } = renderHook(() => useGPUUtilizations(['res-1', 'res-2']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(Object.keys(result.current.utilizations)).toHaveLength(2)
  })

  // ---------- Error Handling ----------

  it('handles API failure silently without throwing', async () => {
    mockGet.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not throw, utilizations remain empty
    expect(result.current.utilizations).toEqual({})
  })

  it('handles null API response', async () => {
    mockGet.mockResolvedValue({ data: null })

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.utilizations).toEqual({})
  })

  it('handles undefined API response', async () => {
    mockGet.mockResolvedValue({ data: undefined })

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.utilizations).toEqual({})
  })

  // ---------- Loading State ----------

  it('sets isLoading true while fetch is in progress', async () => {
    let resolvePromise: ((value: unknown) => void) | undefined
    mockGet.mockReturnValue(new Promise(resolve => { resolvePromise = resolve }))

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))

    // Should be loading while promise is pending
    expect(result.current.isLoading).toBe(true)

    // Resolve and verify loading ends
    await act(async () => { resolvePromise?.({ data: {} }) })
    expect(result.current.isLoading).toBe(false)
  })

  it('sets isLoading false after error', async () => {
    mockGet.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  // ---------- Polling ----------

  it('polls every GPU_UTIL_REFRESH_MS (5 minutes)', async () => {
    const GPU_UTIL_REFRESH_MS = 300_000
    mockGet.mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callsAfterMount = mockGet.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(GPU_UTIL_REFRESH_MS) })
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })

  it('does not poll when IDs array is empty', async () => {
    renderHook(() => useGPUUtilizations([]))

    const GPU_UTIL_REFRESH_MS = 300_000
    await act(async () => { vi.advanceTimersByTime(GPU_UTIL_REFRESH_MS * 3) })

    expect(mockGet).not.toHaveBeenCalled()
  })

  it('cleans up polling interval on unmount', async () => {
    const GPU_UTIL_REFRESH_MS = 300_000
    mockGet.mockResolvedValue({ data: {} })

    const { result, unmount } = renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()
    const callsAfterUnmount = mockGet.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(GPU_UTIL_REFRESH_MS) })
    expect(mockGet.mock.calls.length).toBe(callsAfterUnmount)
  })

  it('does not start polling in demo mode without a real token', async () => {
    mockGetDemoMode.mockReturnValue(true)
    mockHasRealToken.mockReturnValue(false)

    renderHook(() => useGPUUtilizations(['res-1']))

    await act(async () => { vi.advanceTimersByTime(300_000) })
    expect(mockGet).not.toHaveBeenCalled()
  })

  // ---------- ID Change Detection ----------

  it('re-fetches when IDs change', async () => {
    mockGet.mockResolvedValue({ data: {} })

    const { result, rerender } = renderHook(
      ({ ids }) => useGPUUtilizations(ids),
      { initialProps: { ids: ['res-1'] } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callsAfterFirst = mockGet.mock.calls.length

    rerender({ ids: ['res-1', 'res-2'] })
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(callsAfterFirst))
  })

  it('clears data when IDs go from non-empty to empty', async () => {
    mockGet.mockResolvedValue({ data: { 'res-1': [MOCK_SNAPSHOT] } })

    const { result, rerender } = renderHook(
      ({ ids }) => useGPUUtilizations(ids),
      { initialProps: { ids: ['res-1'] } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Object.keys(result.current.utilizations).length).toBeGreaterThan(0)

    rerender({ ids: [] })
    expect(result.current.utilizations).toEqual({})
  })

  it('clears data when demo mode becomes active without a real token', async () => {
    mockGet.mockResolvedValue({ data: { 'res-1': [MOCK_SNAPSHOT] } })

    const { result, rerender } = renderHook(
      ({ ids }) => useGPUUtilizations(ids),
      { initialProps: { ids: ['res-1'] } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.utilizations['res-1']).toHaveLength(1)

    mockGetDemoMode.mockReturnValue(true)
    mockHasRealToken.mockReturnValue(false)
    rerender({ ids: ['res-1'] })

    expect(result.current.utilizations).toEqual({})
    expect(result.current.error).toBeNull()
    expect(result.current.isFailed).toBe(false)
  })

  it('does not re-fetch when IDs are the same (order may differ)', async () => {
    mockGet.mockResolvedValue({ data: {} })

    const { result, rerender } = renderHook(
      ({ ids }) => useGPUUtilizations(ids),
      { initialProps: { ids: ['res-2', 'res-1'] } }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callCount = mockGet.mock.calls.length

    // Same IDs, different order — should not trigger re-fetch because sorted
    rerender({ ids: ['res-1', 'res-2'] })

    // Give time for any async ops to settle
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(mockGet.mock.calls.length).toBe(callCount)
  })

  // ---------- Timeout ----------

  it('passes a timeout to the API call', async () => {
    mockGet.mockResolvedValue({ data: {} })

    renderHook(() => useGPUUtilizations(['res-1']))
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    const callArgs = mockGet.mock.calls[0]
    expect(callArgs[1]).toHaveProperty('timeout')
    expect(typeof callArgs[1].timeout).toBe('number')
  })
})
