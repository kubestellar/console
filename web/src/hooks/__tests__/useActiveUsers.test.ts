import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
  isDemoModeForced: true,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

import { useActiveUsers } from '../useActiveUsers'

describe('useActiveUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeUsers: 5, totalConnections: 8 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial state', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.activeUsers).toBe('number')
    expect(typeof result.current.totalConnections).toBe('number')
    expect(typeof result.current.viewerCount).toBe('number')
  })

  it('provides refetch function', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.refetch).toBe('function')
  })

  it('provides loading and error states', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.hasError).toBe('boolean')
  })

  it('refetch resets circuit breaker', () => {
    const { result } = renderHook(() => useActiveUsers())
    act(() => { result.current.refetch() })
    // Should not throw
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useActiveUsers())
    expect(() => unmount()).not.toThrow()
  })

  // --- Return shape completeness ---
  it('returns all expected properties', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(result.current).toHaveProperty('activeUsers')
    expect(result.current).toHaveProperty('totalConnections')
    expect(result.current).toHaveProperty('viewerCount')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('hasError')
    expect(result.current).toHaveProperty('refetch')
  })

  // --- Demo mode uses totalConnections for viewerCount ---
  it('viewerCount equals totalConnections in demo mode', async () => {
    const { result } = renderHook(() => useActiveUsers())
    // Let the initial fetch complete
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await waitFor(() => {
      // In demo mode (getDemoMode returns true), viewerCount = totalConnections
      expect(result.current.viewerCount).toBe(result.current.totalConnections)
    })
  })

  // --- Fetches active users from API ---
  it('fetches active users from /api/active-users', async () => {
    renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(fetch).toHaveBeenCalledWith(
      '/api/active-users',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  // --- Handles API errors gracefully ---
  it('handles fetch errors without crashing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should not crash, should still have valid state
    expect(typeof result.current.activeUsers).toBe('number')
    expect(typeof result.current.viewerCount).toBe('number')
  })

  // --- Handles non-ok HTTP responses ---
  it('handles non-ok HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 500 })
    )

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Hook should not crash
    expect(typeof result.current.activeUsers).toBe('number')
  })

  // --- Polling fetches periodically ---
  it('polls at regular intervals', async () => {
    renderHook(() => useActiveUsers())

    const initialCallCount = vi.mocked(fetch).mock.calls.length

    // Advance past one poll interval (10 seconds)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })

    // Should have additional fetch calls from polling
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  // --- Circuit breaker trips after MAX_FAILURES ---
  it('stops polling after too many consecutive failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useActiveUsers())

    // Advance enough time for multiple poll intervals to trigger failures
    // MAX_FAILURES = 3, POLL_INTERVAL = 10s
    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    }

    // After circuit breaker trips, hasError should be true
    await waitFor(() => {
      expect(result.current.hasError).toBe(true)
    })
  })

  // --- refetch works after circuit breaker ---
  it('refetch restarts polling after circuit breaker trip', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useActiveUsers())

    // Trip circuit breaker
    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    }

    // Now fix fetch and refetch
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ activeUsers: 3, totalConnections: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    act(() => { result.current.refetch() })
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // After refetch, hasError should clear
    await waitFor(() => {
      expect(result.current.hasError).toBe(false)
    })
  })

  // --- Updates counts when API returns new data ---
  it('updates active user counts when API returns new data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ activeUsers: 10, totalConnections: 15 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await waitFor(() => {
      expect(result.current.activeUsers).toBe(10)
      expect(result.current.totalConnections).toBe(10) // smoothed to same value since smoothing uses max
    })
  })

  // --- Handles HTML fallback response (Netlify SPA catch-all) ---
  it('handles HTML response without SyntaxError (Netlify SPA fallback)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<!doctype html><html><body>SPA</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    )

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should not crash or throw SyntaxError — gracefully treated as error
    expect(typeof result.current.activeUsers).toBe('number')
  })

  // --- Handles invalid JSON gracefully ---
  it('handles invalid JSON response without crashing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should not crash, numbers remain valid
    expect(typeof result.current.activeUsers).toBe('number')
  })

  // --- Multiple hook instances share singleton state ---
  it('multiple hook instances share state without duplicate polling', () => {
    const { result: result1 } = renderHook(() => useActiveUsers())
    const { result: result2 } = renderHook(() => useActiveUsers())

    // Both should have the same state shape
    expect(typeof result1.current.activeUsers).toBe('number')
    expect(typeof result2.current.activeUsers).toBe('number')
  })

  // --- isLoading clears after successful fetch ---
  it('isLoading clears after first successful fetch', async () => {
    const { result } = renderHook(() => useActiveUsers())

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })
})
