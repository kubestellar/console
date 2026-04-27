/**
 * Tests for useProviderConnection hook.
 *
 * Validates the provider connection lifecycle:
 *   idle -> starting -> handshake -> connected | failed
 *
 * Covers: happy path, timeout, prerequisites from backend,
 * retry, reset, dismiss, cleanup on unmount, abort during polling,
 * health-endpoint fallback, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
}))

let useProviderConnection: typeof import('../useProviderConnection').useProviderConnection

/** Flush microtask queue so async handlers settle. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Mock fetch to return a ready provider via /provider/check. */
function mockCheckReady(version = '1.0') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ready: true, version }),
  })
}

/** Mock fetch to return not-ready from /provider/check (no prerequisites). */
function mockCheckNotReady(message = 'Not ready') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ready: false, message }),
  })
}

/** Mock fetch to return not-ready with prerequisites from /provider/check. */
function mockCheckWithPrerequisites(prerequisites: string[], message = 'Not configured') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ ready: false, message, prerequisites }),
  })
}

/** Mock fetch to hang (never resolve). */
function mockFetchHang() {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise(() => {})
  )
}

describe('useProviderConnection', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn())

    const mod = await import('../useProviderConnection')
    useProviderConnection = mod.useProviderConnection
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // =========================================================================
  // 1. Initial idle state
  // =========================================================================

  it('starts in idle state with null provider and no error', () => {
    const { result } = renderHook(() => useProviderConnection())

    expect(result.current.connectionState.phase).toBe('idle')
    expect(result.current.connectionState.provider).toBeNull()
    expect(result.current.connectionState.startedAt).toBeNull()
    expect(result.current.connectionState.error).toBeNull()
    expect(result.current.connectionState.retryCount).toBe(0)
    expect(result.current.connectionState.prerequisite).toBeNull()
    expect(result.current.connectionState.prerequisites).toEqual([])
  })

  it('exposes startConnection, retry, reset, dismiss functions', () => {
    const { result } = renderHook(() => useProviderConnection())

    expect(typeof result.current.startConnection).toBe('function')
    expect(typeof result.current.retry).toBe('function')
    expect(typeof result.current.reset).toBe('function')
    expect(typeof result.current.dismiss).toBe('function')
  })

  // =========================================================================
  // 2. Happy path -- provider check endpoint reports ready
  // =========================================================================

  it('connects successfully when /provider/check reports ready', async () => {
    const onSuccess = vi.fn()
    mockCheckReady('2.0.0')

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', onSuccess)
    })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
    expect(result.current.connectionState.error).toBeNull()
    expect(result.current.connectionState.prerequisites).toEqual([])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sets provider name and startedAt during handshake', async () => {
    mockFetchHang()
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.startConnection('vscode', vi.fn())
    })

    expect(result.current.connectionState.phase).toBe('handshake')
    expect(result.current.connectionState.provider).toBe('vscode')
    expect(result.current.connectionState.startedAt).toBeGreaterThan(0)
    expect(result.current.connectionState.retryCount).toBe(0)
  })

  it('populates prerequisite description for known providers like vscode', () => {
    mockFetchHang()
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.startConnection('vscode', vi.fn())
    })

    expect(result.current.connectionState.prerequisite).toContain('Copilot')
  })

  it('has null prerequisite for providers without known prerequisites', () => {
    mockFetchHang()
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.startConnection('claude', vi.fn())
    })

    expect(result.current.connectionState.prerequisite).toBeNull()
  })

  // =========================================================================
  // 3. Fallback to /health endpoint
  // =========================================================================

  it('falls back to /health when /provider/check is unavailable', async () => {
    const onSuccess = vi.fn()
    let callCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      callCount++
      if (url.includes('/provider/check')) {
        return Promise.reject(new Error('Not found'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          availableProviders: [{ name: 'claude' }],
        }),
      })
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', onSuccess)
    })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(callCount).toBe(2)
  })

  it('fails when /health does not include the provider in availableProviders', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/provider/check')) {
        return Promise.reject(new Error('Not found'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          availableProviders: [{ name: 'openai' }],
        }),
      })
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.error).toContain('not found')
  })

  it('fails when /health returns a non-ok status and /provider/check is unavailable', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/provider/check')) {
        return Promise.reject(new Error('Not found'))
      }
      return Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.error).toContain('HTTP 503')
  })

  it('fails when both endpoints are unreachable', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    )

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.error).toContain('Unable to reach local agent')
  })

  // =========================================================================
  // 4. Timeout during handshake
  // =========================================================================

  it('times out after 10s when provider is never ready', async () => {
    mockCheckNotReady()

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    // Advance enough time to exceed the 10s timeout (poll every 1s)
    for (let i = 0; i < 12; i++) {
      await act(async () => { vi.advanceTimersByTime(1000) })
      await flushMicrotasks()
    }

    expect(result.current.connectionState.phase).toBe('failed')
    expect(result.current.connectionState.error).toContain('timed out')
  })

  it('timeout message includes prerequisite description for known providers', async () => {
    mockCheckNotReady()

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('vscode', vi.fn())
    })
    await flushMicrotasks()

    for (let i = 0; i < 12; i++) {
      await act(async () => { vi.advanceTimersByTime(1000) })
      await flushMicrotasks()
    }

    expect(result.current.connectionState.phase).toBe('failed')
    expect(result.current.connectionState.error).toContain('Copilot')
  })

  it('timeout message is generic for unknown providers', async () => {
    mockCheckNotReady()

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    for (let i = 0; i < 12; i++) {
      await act(async () => { vi.advanceTimersByTime(1000) })
      await flushMicrotasks()
    }

    expect(result.current.connectionState.phase).toBe('failed')
    expect(result.current.connectionState.error).toContain('10s')
    expect(result.current.connectionState.error).toContain('provider may not be running')
  })

  // =========================================================================
  // 5. Prerequisites from backend stop polling
  // =========================================================================

  it('stops polling and shows prerequisites when backend returns them', async () => {
    const prerequisites = [
      'Install the Antigravity CLI',
      'Run: antigravity auth login',
    ]
    mockCheckWithPrerequisites(prerequisites, 'Antigravity CLI not configured')

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('antigravity', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('failed')
    expect(result.current.connectionState.error).toContain('Antigravity CLI')
    expect(result.current.connectionState.prerequisites).toEqual(prerequisites)
  })

  // =========================================================================
  // 6. Retry logic
  // =========================================================================

  it('retry() re-attempts the connection with the same provider', async () => {
    mockCheckWithPrerequisites(['Install extension'], 'Not ready')

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('vscode', onSuccess)
    })
    await flushMicrotasks()
    expect(result.current.connectionState.phase).toBe('failed')

    // Now make provider available for retry
    mockCheckReady('1.0')

    await act(async () => {
      await result.current.retry(onSuccess)
    })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('retry() does nothing when no provider is set', () => {
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.retry(vi.fn())
    })

    expect(result.current.connectionState.phase).toBe('idle')
  })

  // =========================================================================
  // 7. Reset
  // =========================================================================

  it('reset() returns state to idle and clears all fields', async () => {
    mockCheckReady()
    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()
    expect(result.current.connectionState.phase).toBe('connected')

    act(() => { result.current.reset() })

    expect(result.current.connectionState.phase).toBe('idle')
    expect(result.current.connectionState.provider).toBeNull()
    expect(result.current.connectionState.error).toBeNull()
    expect(result.current.connectionState.retryCount).toBe(0)
    expect(result.current.connectionState.prerequisites).toEqual([])
  })

  it('reset() aborts an in-progress connection', async () => {
    mockFetchHang()
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.startConnection('claude', vi.fn())
    })
    expect(result.current.connectionState.phase).toBe('handshake')

    act(() => { result.current.reset() })

    expect(result.current.connectionState.phase).toBe('idle')
    expect(result.current.connectionState.provider).toBeNull()
  })

  // =========================================================================
  // 8. Dismiss
  // =========================================================================

  it('dismiss() moves to idle but preserves the provider', async () => {
    mockCheckWithPrerequisites(['Install ext'], 'Not ready')
    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('vscode', vi.fn())
    })
    await flushMicrotasks()
    expect(result.current.connectionState.phase).toBe('failed')

    act(() => { result.current.dismiss() })

    expect(result.current.connectionState.phase).toBe('idle')
    expect(result.current.connectionState.provider).toBe('vscode')
    expect(result.current.connectionState.error).toBeNull()
  })

  // =========================================================================
  // 9. Abort on unmount
  // =========================================================================

  it('stops polling when unmounted during handshake', async () => {
    mockCheckNotReady()
    const { result, unmount } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    const callCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    unmount()

    await act(async () => { vi.advanceTimersByTime(5000) })
    await flushMicrotasks()

    const callCountAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    // At most one more call may slip through from an already-scheduled timer
    expect(callCountAfter - callCountBefore).toBeLessThanOrEqual(1)
  })

  // =========================================================================
  // 10. Polling at 1s intervals during handshake
  // =========================================================================

  it('polls at 1s intervals during handshake until ready', async () => {
    let pollCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      pollCount++
      if (url.includes('/provider/check')) {
        if (pollCount <= 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ready: false, message: 'Starting...' }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ready: true, version: '3.0' }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', onSuccess)
    })
    await flushMicrotasks()
    expect(result.current.connectionState.phase).toBe('handshake')

    // Advance 1s for second poll
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flushMicrotasks()
    expect(result.current.connectionState.phase).toBe('handshake')

    // Advance 1s for third poll -- should succeed
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  // =========================================================================
  // 11. Error displayed during polling (no prerequisites)
  // =========================================================================

  it('shows error from check endpoint during polling but continues', async () => {
    let pollCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      pollCount++
      if (url.includes('/provider/check')) {
        if (pollCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ready: false, message: 'Initializing...' }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ready: true }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    // Error is set but phase is still handshake (polling continues)
    expect(result.current.connectionState.error).toBe('Initializing...')
    expect(result.current.connectionState.phase).toBe('handshake')

    // Next poll succeeds
    await act(async () => { vi.advanceTimersByTime(1000) })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
  })

  // =========================================================================
  // 12. Empty prerequisites array continues polling
  // =========================================================================

  it('treats empty prerequisites array as no-prerequisites (continues polling)', async () => {
    let pollCount = 0
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      pollCount++
      if (url.includes('/provider/check')) {
        if (pollCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              ready: false,
              message: 'Warming up',
              prerequisites: [],
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ready: true }),
        })
      }
      return Promise.reject(new Error('unexpected'))
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('handshake')

    await act(async () => { vi.advanceTimersByTime(1000) })
    await flushMicrotasks()

    expect(result.current.connectionState.phase).toBe('connected')
  })

  // =========================================================================
  // 13. Health fallback with missing availableProviders
  // =========================================================================

  it('handles /health response with missing availableProviders field', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/provider/check')) {
        return Promise.reject(new Error('Not supported'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    })

    const { result } = renderHook(() => useProviderConnection())

    await act(async () => {
      await result.current.startConnection('claude', vi.fn())
    })
    await flushMicrotasks()

    expect(result.current.connectionState.error).toContain('not found')
  })

  // =========================================================================
  // 14. Antigravity prerequisite description is populated
  // =========================================================================

  it('populates prerequisite for antigravity provider', () => {
    mockFetchHang()
    const { result } = renderHook(() => useProviderConnection())

    act(() => {
      result.current.startConnection('antigravity', vi.fn())
    })

    expect(result.current.connectionState.prerequisite).toContain('Antigravity CLI')
  })
})
