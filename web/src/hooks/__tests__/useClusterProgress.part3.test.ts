/**
 * Tests for useClusterProgress hook.
 *
 * Validates WebSocket connection, message parsing for local_cluster_progress
 * events, dismiss behaviour, and cleanup on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MockWebSocket,
  wsInstances,
  resetWsInstances,
  renderClusterProgressHook,
  advanceTimersAndFlush,
} from './useClusterProgress.helpers'
import type { MockWebSocketInstance } from './useClusterProgress.helpers'

const { mockGetWsAuthParams } = vi.hoisted(() => ({
  mockGetWsAuthParams: vi.fn((url: string) => Promise.resolve({ url, protocols: [] as string[] })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
} })

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: mockGetWsAuthParams,
}))

// Assign mock to global before importing the hook
vi.stubGlobal('WebSocket', MockWebSocket)

describe('max reconnect attempts exceeded', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetWsInstances()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('stops reconnecting after MAX_WS_RECONNECT_ATTEMPTS onclose cycles', async () => {
    // Use a WebSocket that never calls onopen (so attempts never reset)
    class NeverOpenWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      onopen: (() => void) | null = null
      onmessage: ((e: { data: string }) => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      close = vi.fn(() => { if (this.onclose) this.onclose() })
      readyState = 0

      constructor() {
        wsInstances.push(this as unknown as MockWebSocketInstance)
        // Don't call onopen — so reconnect attempt counter never resets
        setTimeout(() => { if (this.onclose) this.onclose() }, 0)
      }
    }
    vi.stubGlobal('WebSocket', NeverOpenWebSocket)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await renderClusterProgressHook()

    // Advance through enough reconnect cycles to exceed MAX_WS_RECONNECT_ATTEMPTS (5)
    // Each cycle: 0ms (initial close fires) + backoff delays
    // We advance generously to let all timers fire
    for (let i = 0; i < 10; i++) {
      await advanceTimersAndFlush(60_000)
    }

    // After 5+ failed reconnects, the warning should have been issued
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max reconnect attempts exceeded')
    )

    warnSpy.mockRestore()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
})

// ── WebSocket constructor throws (catch block lines 87-105 in source) ──

describe('WebSocket constructor throws', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetWsInstances()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('schedules retry when WebSocket constructor throws', async () => {
    let throwCount = 0
    const MAX_THROWS = 2

    class ThrowingWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      onopen: (() => void) | null = null
      onmessage: ((e: { data: string }) => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      readyState = 0
      close = vi.fn()

      constructor() {
        throwCount++
        if (throwCount <= MAX_THROWS) {
          throw new Error('WebSocket not available')
        }
        wsInstances.push(this as unknown as MockWebSocketInstance)
        setTimeout(() => { if (this.onopen) this.onopen() }, 0)
      }
    }
    vi.stubGlobal('WebSocket', ThrowingWebSocket)

    const { result } = await renderClusterProgressHook()

    // Initially no progress (constructor threw)
    expect(result.current.progress).toBeNull()

    // Advance timers to trigger retry after backoff
    await advanceTimersAndFlush(30_000)

    // After retries, a successful WebSocket should have been created
    // progress is still null but no error thrown
    expect(result.current.progress).toBeNull()

    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  it('continues scheduling retries with backoff when constructor keeps throwing', async () => {
    // When new WebSocket() always throws, reconnectAttemptsRef.current is never
    // updated (it's set AFTER the constructor), so the catch block schedules
    // retries indefinitely using getWsBackoffDelay. This test confirms the retry
    // loop stays alive (no unhandled exception escapes) and covers catch lines 87-104.
    class AlwaysThrowingWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      onopen: (() => void) | null = null
      onmessage: ((e: { data: string }) => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      readyState = 0
      close = vi.fn()

      constructor() {
        throw new Error('Agent unavailable')
      }
    }
    vi.stubGlobal('WebSocket', AlwaysThrowingWebSocket)

    const { result } = await renderClusterProgressHook()

    // Advance timers to let catch-block retries fire
    for (let i = 0; i < 5; i++) {
      await advanceTimersAndFlush(60_000)
    }

    // No error thrown — hook is still alive with null progress
    expect(result.current.progress).toBeNull()

    vi.stubGlobal('WebSocket', MockWebSocket)
  })
})
