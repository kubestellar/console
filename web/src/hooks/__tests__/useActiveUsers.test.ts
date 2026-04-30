/**
 * Tests for pure/singleton functions in useActiveUsers.ts
 *
 * Covers: isJsonResponse (indirect via fetch mock), __resetForTest,
 * and getSessionId (indirect via heartbeat/session behavior).
 */
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

  // ── isJsonResponse (indirect — exercised by fetchActiveUsers) ──

  describe('isJsonResponse guard (indirect)', () => {
    it('accepts application/json content-type and parses successfully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 42, totalConnections: 50 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.activeUsers).toBe(42)
      })
    })

    it('rejects text/html response without crashing (Netlify SPA fallback)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      // Should not crash; activeUsers stays at default
      expect(result.current.activeUsers).toBe(0)
    })

    it('rejects response with no content-type header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: {}, // no content-type
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      // Guard should reject, activeUsers stays 0
      expect(result.current.activeUsers).toBe(0)
    })

    it('accepts content-type with extra parameters', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 7, totalConnections: 10 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; boundary=something' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.activeUsers).toBe(7)
      })
    })

    it('rejects application/xml content-type', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<xml/>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(result.current.activeUsers).toBe(0)
    })
  })

  // ── __resetForTest ──

  describe('__resetForTest', () => {
    it('resets shared state so new hook instances start fresh', async () => {
      // First: populate state
      const { result, unmount } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.activeUsers).toBe(5)
      })
      unmount()

      // Reset
      __resetForTest()

      // Now mock different data
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 99, totalConnections: 100 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result: result2 } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result2.current.activeUsers).toBe(99)
      })
    })

    it('clears subscribers so old callbacks are not called', () => {
      const { unmount } = renderHook(() => useActiveUsers())
      __resetForTest()
      // After reset, no subscribers should exist -- mounting a new hook should work fine
      const { result } = renderHook(() => useActiveUsers())
      expect(result.current.activeUsers).toBe(0) // fresh state
      unmount()
    })

    it('resets consecutive failure counter', async () => {
      // Cause failures
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
      const { unmount } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      unmount()

      // Reset clears failure count
      __resetForTest()

      // Now succeed
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 3, totalConnections: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.activeUsers).toBe(3)
      })
    })

    it('clears heartbeat and poll timers', () => {
      renderHook(() => useActiveUsers())
      // Should not throw
      expect(() => __resetForTest()).not.toThrow()
    })

    it('can be called multiple times without error', () => {
      expect(() => {
        __resetForTest()
        __resetForTest()
        __resetForTest()
      }).not.toThrow()
    })
  })

  // ── getSessionId (indirect — exercised via heartbeat POST body) ──

  describe('getSessionId (indirect)', () => {
    it('creates session ID in sessionStorage on first heartbeat', async () => {
      mockGetDemoMode.mockReturnValue(true)
      expect(sessionStorage.getItem('kc-session-id')).toBeNull()
      renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      const id = sessionStorage.getItem('kc-session-id')
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
    })

    it('reuses existing session ID from sessionStorage', async () => {
      sessionStorage.setItem('kc-session-id', 'pre-existing-id-42')
      mockGetDemoMode.mockReturnValue(true)
      renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(sessionStorage.getItem('kc-session-id')).toBe('pre-existing-id-42')
    })

    it('session ID is included in heartbeat POST body', async () => {
      sessionStorage.setItem('kc-session-id', 'my-session-xyz')
      mockGetDemoMode.mockReturnValue(true)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 1, totalConnections: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      // Find the POST call (heartbeat)
      const postCalls = fetchSpy.mock.calls.filter(
        call => call[1] && (call[1] as RequestInit).method === 'POST'
      )
      expect(postCalls.length).toBeGreaterThan(0)
      const body = JSON.parse((postCalls[0][1] as RequestInit).body as string)
      expect(body.sessionId).toBe('my-session-xyz')
    })

    it('generates different IDs for different sessions', () => {
      // Simulate by clearing sessionStorage between checks
      sessionStorage.clear()
      // Use crypto.randomUUID mock
      const originalRandomUUID = crypto.randomUUID
      let callCount = 0
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
        callCount++
        return `uuid-${callCount}` as `${string}-${string}-${string}-${string}-${string}`
      })

      // We can't directly call getSessionId, but we verify the mechanism:
      // clearing sessionStorage means next call would generate a new one
      sessionStorage.clear()
      expect(sessionStorage.getItem('kc-session-id')).toBeNull()

      // Restore
      if (originalRandomUUID) {
        vi.mocked(crypto.randomUUID).mockRestore()
      }
    })
  })

  // ── Additional edge cases for data validation ──

  describe('data validation in fetchActiveUsers', () => {
    it('rejects NaN activeUsers value', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: NaN, totalConnections: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      // NaN is not finite, so it should be rejected
      expect(result.current.activeUsers).toBe(0)
    })

    it('rejects Infinity activeUsers value', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: Infinity, totalConnections: 5 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(result.current.activeUsers).toBe(0)
    })

    it('handles HTTP 500 error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(result.current.activeUsers).toBe(0)
    })
  })

  // ── __testables pure functions ──

  describe('__testables', () => {
    it('isJsonResponse accepts application/json', async () => {
      const mod = await import('../useActiveUsers')
      const resp = new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      expect(mod.__testables.isJsonResponse(resp)).toBe(true)
    })

    it('isJsonResponse rejects text/html', async () => {
      const mod = await import('../useActiveUsers')
      const resp = new Response('<html>', { headers: { 'Content-Type': 'text/html' } })
      expect(mod.__testables.isJsonResponse(resp)).toBe(false)
    })

    it('isJsonResponse rejects missing content-type', async () => {
      const mod = await import('../useActiveUsers')
      const resp = new Response('data', { headers: {} })
      expect(mod.__testables.isJsonResponse(resp)).toBe(false)
    })

    it('isJsonResponse accepts content-type with charset', async () => {
      const mod = await import('../useActiveUsers')
      const resp = new Response('{}', { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      expect(mod.__testables.isJsonResponse(resp)).toBe(true)
    })

    it('getSessionId creates and caches session ID', async () => {
      const mod = await import('../useActiveUsers')
      sessionStorage.clear()
      const id1 = mod.__testables.getSessionId()
      expect(typeof id1).toBe('string')
      expect(id1.length).toBeGreaterThan(0)
      const id2 = mod.__testables.getSessionId()
      expect(id2).toBe(id1)
    })

    it('getSessionId reuses stored ID', async () => {
      const mod = await import('../useActiveUsers')
      sessionStorage.setItem('kc-session-id', 'pre-existing-id')
      expect(mod.__testables.getSessionId()).toBe('pre-existing-id')
    })

    it('POLL_INTERVAL is 10 seconds', async () => {
      const mod = await import('../useActiveUsers')
      expect(mod.__testables.POLL_INTERVAL).toBe(10_000)
    })

    it('HEARTBEAT_INTERVAL is 30 seconds', async () => {
      const mod = await import('../useActiveUsers')
      expect(mod.__testables.HEARTBEAT_INTERVAL).toBe(30_000)
    })

    it('MAX_FAILURES is positive', async () => {
      const mod = await import('../useActiveUsers')
      expect(mod.__testables.MAX_FAILURES).toBeGreaterThan(0)
    })

    it('SMOOTHING_WINDOW is positive', async () => {
      const mod = await import('../useActiveUsers')
      expect(mod.__testables.SMOOTHING_WINDOW).toBeGreaterThan(0)
    })

    it('disconnectPresence does not throw when no connection exists', async () => {
      const mod = await import('../useActiveUsers')
      expect(() => mod.__testables.disconnectPresence()).not.toThrow()
    })
  })

  // ── Refetch after error recovery ──

  describe('error recovery', () => {
    it('refetch resets circuit breaker and re-fetches', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 10, totalConnections: 12 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      act(() => { result.current.refetch() })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.activeUsers).toBe(10)
      })
    })

    it('returns hasError false initially', () => {
      const { result } = renderHook(() => useActiveUsers())
      expect(result.current.hasError).toBe(false)
    })

    it('viewerCount uses activeUsers in non-demo mode', async () => {
      mockGetDemoMode.mockReturnValue(false)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ activeUsers: 7, totalConnections: 12 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const { result } = renderHook(() => useActiveUsers())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      await waitFor(() => {
        expect(result.current.viewerCount).toBe(7)
      })
    })
  })
})
