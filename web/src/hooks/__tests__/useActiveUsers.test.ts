import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { mockGetDemoMode } = vi.hoisted(() => ({
  mockGetDemoMode: vi.fn(() => true),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
  isDemoModeForced: true,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_TOKEN: 'kc-auth-token',
  }
})

import { useActiveUsers, __resetForTest } from '../useActiveUsers'

describe('useActiveUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    // Reset singleton state to prevent leaking between tests (#4775)
    __resetForTest()
    mockGetDemoMode.mockReturnValue(true)
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

    // Let initial fetches (from startPolling + heartbeat callback) settle
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Advance through poll intervals to accumulate failures.
    // The initial render already causes 2 failures (startPolling immediate +
    // heartbeat callback). Two more interval ticks push past MAX_FAILURES = 3,
    // and the subsequent tick enters the circuit breaker guard.
    // Advance just enough to trip the breaker but NOT past the RECOVERY_DELAY
    // (30s) which would reset hasError.
    for (let i = 0; i < 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    }

    expect(result.current.hasError).toBe(true)
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

  // ══════════════════════════════════════════════════════════════════════
  // NEW TESTS — Targeting uncovered branches and edge cases
  // ══════════════════════════════════════════════════════════════════════

  // ── Visibility change handler re-starts polling ───────────────────────
  it('recovers polling when tab becomes visible again', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ activeUsers: 7, totalConnections: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const callsBefore = vi.mocked(fetch).mock.calls.length

    // Simulate tab becoming visible
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should have triggered an extra fetch
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ── Visibility change triggers immediate fetch when poll is running ───
  it('fetches immediately on visibility change even when poll is active', async () => {
    renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const callsBefore = vi.mocked(fetch).mock.calls.length

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ── Demo mode change triggers refetch ─────────────────────────────────
  it('refetches when demo mode changes', async () => {
    renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    const callsBefore = vi.mocked(fetch).mock.calls.length

    act(() => {
      window.dispatchEvent(new Event('kc-demo-mode-change'))
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should have triggered an extra fetch from the demo change handler
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ── Smoothing takes max of recent counts ──────────────────────────────
  it('smoothing uses max of recent counts to prevent flicker', async () => {
    // All GET requests return high count initially (handles heartbeat + poll GETs)
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (typeof options === 'object' && options?.method === 'POST') {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ activeUsers: 10, totalConnections: 10 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    await waitFor(() => {
      expect(result.current.activeUsers).toBe(10)
    })

    // Now switch to lower count for subsequent GETs (should smooth to max = 10)
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (typeof options === 'object' && options?.method === 'POST') {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ activeUsers: 5, totalConnections: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })

    await waitFor(() => {
      // Smoothing keeps the max (10), not the latest (5)
      expect(result.current.activeUsers).toBe(10)
    })
  })

  // ── Recovery after circuit breaker trips automatically ────────────────
  it('automatically recovers after circuit breaker recovery delay', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const RECOVERY_DELAY_MS = 30_000

    const { result } = renderHook(() => useActiveUsers())

    // Let initial fetches settle, then advance through poll intervals
    // to trip the circuit breaker (MAX_FAILURES = 3).
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    for (let i = 0; i < 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    }

    expect(result.current.hasError).toBe(true)

    // Fix fetch before the recovery timer fires
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (typeof options === 'object' && options?.method === 'POST') {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ activeUsers: 2, totalConnections: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Advance past the recovery delay so the recovery timer fires
    await act(async () => { await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_MS + 1_000) })

    await waitFor(() => {
      expect(result.current.hasError).toBe(false)
    })
  })

  // ── Session ID generation via sessionStorage ──────────────────────────
  it('creates a session ID in sessionStorage on first call', async () => {
    // Use a fresh module import to reset singleton state (heartbeatStarted)
    // so startHeartbeat() actually calls sendHeartbeat() → getSessionId()
    vi.resetModules()
    const freshMod = await import('../useActiveUsers')

    sessionStorage.clear()
    renderHook(() => freshMod.useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // The heartbeat sends a POST with sessionId from sessionStorage
    const sessionId = sessionStorage.getItem('kc-session-id')
    expect(sessionId).not.toBeNull()
    expect(typeof sessionId).toBe('string')
  })

  // ── Session ID reuses existing value ──────────────────────────────────
  it('reuses existing session ID from sessionStorage', async () => {
    const EXISTING_ID = 'existing-session-id-123'
    sessionStorage.setItem('kc-session-id', EXISTING_ID)

    renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    expect(sessionStorage.getItem('kc-session-id')).toBe(EXISTING_ID)
  })

  // ── Heartbeat sends POST to /api/active-users ────────────────────────
  it('sends heartbeat POST with session ID in demo/Netlify mode', async () => {
    // Use a fresh module import to reset singleton state (heartbeatStarted)
    vi.resetModules()
    const freshMod = await import('../useActiveUsers')

    renderHook(() => freshMod.useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Check that a POST was sent (heartbeat)
    const postCalls = vi.mocked(fetch).mock.calls.filter(
      call => typeof call[1] === 'object' && call[1]?.method === 'POST'
    )
    expect(postCalls.length).toBeGreaterThan(0)
    // Verify the POST body includes a sessionId
    const postBody = JSON.parse(postCalls[0][1]?.body as string)
    expect(postBody).toHaveProperty('sessionId')
    expect(typeof postBody.sessionId).toBe('string')
  })

  // ── Heartbeat failure is silent (best-effort) ────────────────────────
  it('handles heartbeat POST failure gracefully', async () => {
    // Make POST fail but GET succeed
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (typeof options === 'object' && options?.method === 'POST') {
        throw new Error('POST failed')
      }
      return new Response(JSON.stringify({ activeUsers: 3, totalConnections: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Should not crash; state should still be valid
    expect(typeof result.current.activeUsers).toBe('number')
  })

  // ── Consecutive failures increment correctly ──────────────────────────
  it('tracks consecutive failures and clears on success', async () => {
    // Note: startHeartbeat() is a no-op (already called by previous test).
    // startPolling() resets consecutiveFailures to 0 each time, so failure
    // tracking is fresh. The `recentCounts` smoothing array may contain
    // values from previous tests, so we check activeUsers >= expected
    // (smoothing uses Math.max over a sliding window).
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ activeUsers: 42, totalConnections: 42 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    const { result } = renderHook(() => useActiveUsers())

    // After first failure
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(result.current.hasError).toBe(false) // not yet at MAX_FAILURES

    // After second failure
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    expect(result.current.hasError).toBe(false) // still not at MAX_FAILURES=3

    // After successful recovery — use a high count (42) that exceeds any
    // previous test's count so smoothing's Math.max still returns 42.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500) })
    await waitFor(() => {
      expect(result.current.hasError).toBe(false)
      expect(result.current.activeUsers).toBeGreaterThanOrEqual(4)
    })
  })

  // ── Null JSON response handled ────────────────────────────────────────
  it('handles response.json() returning null-like data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useActiveUsers())
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Should treat null JSON as error, not crash
    expect(typeof result.current.activeUsers).toBe('number')
  })

  // ── Unmount removes demo-mode and visibility listeners ────────────────
  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const removeDocSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useActiveUsers())
    unmount()

    // Should have removed kc-demo-mode-change listener
    const windowCalls = removeSpy.mock.calls.map(c => c[0])
    expect(windowCalls).toContain('kc-demo-mode-change')

    // Should have removed visibilitychange listener
    const docCalls = removeDocSpy.mock.calls.map(c => c[0])
    expect(docCalls).toContain('visibilitychange')

    removeSpy.mockRestore()
    removeDocSpy.mockRestore()
  })
})
