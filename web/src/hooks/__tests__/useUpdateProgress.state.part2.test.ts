/**
 * Tests for useUpdateProgress hook.
 *
 * Validates WebSocket connection, parsing of update_progress messages,
 * step history tracking, dismiss behaviour, stale detection, reconnect
 * logic, and cleanup on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------

type WSHandler = ((event: { data: string }) => void) | null

interface MockWebSocketInstance {
  onopen: (() => void) | null
  onmessage: WSHandler
  onclose: (() => void) | null
  onerror: (() => void) | null
  close: ReturnType<typeof vi.fn>
  readyState: number
}

let wsInstances: MockWebSocketInstance[] = []

class MockWebSocket implements MockWebSocketInstance {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  onopen: (() => void) | null = null
  onmessage: WSHandler = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  })
  readyState = MockWebSocket.OPEN

  constructor() {
    wsInstances.push(this)
    // Simulate async open
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 0)
  }
}

// ---------------------------------------------------------------------------
// Mocks — before module import
// ---------------------------------------------------------------------------

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
  isDemoMode: () => false,
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: async (url: string) => ({ url, protocols: [] }),
}))

// Assign mock to global before importing the hook
vi.stubGlobal('WebSocket', MockWebSocket)

import { useUpdateProgress } from '../useUpdateProgress'

/** Helper to send an update_progress message to the latest WebSocket */
function sendProgress(ws: MockWebSocketInstance, payload: Record<string, unknown>) {
  act(() => {
    ws.onmessage!({
      data: JSON.stringify({ type: 'update_progress', payload }),
    })
  })
}

async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function renderUpdateProgressHook() {
  const hook = renderHook(() => useUpdateProgress())
  await flushMicrotasks()
  return hook
}

describe('useUpdateProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows progressive messages during backend health polling', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })

    // Mock fetch to never return ok (always starting)
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'starting' }),
      })
    ))

    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    // Reconnect auto-opens the new socket in the mock constructor.
    await act(async () => { await Promise.resolve() })
    expect(result.current.progress?.message).toMatch(
      /Waiting for services to restart|Starting backend services/
    )

    // Advance several polls to get elapsed time past the 10s threshold.
    const POLLS_FOR_10S = 6 // 6 * 2000ms = 12s
    for (let i = 0; i < POLLS_FOR_10S; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    expect(result.current.progress?.status).toBe('restarting')
    expect(result.current.progress?.message).toMatch(
      /Starting backend services|Backend initializing/
    )

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── waitForBackend: fetch error does not crash, continues polling ──

  it('continues polling when fetch throws during waitForBackend', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })

    // Mock fetch to throw first, then succeed
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++
      if (callCount <= 2) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    }))

    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through polls — errors should be swallowed
    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    // Eventually should reach "done" after fetch succeeds
    expect(result.current.progress?.status).toBe('done')

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── waitForBackend: non-ok response continues polling ──

  it('continues polling when /health returns non-ok response', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++
      if (callCount <= 2) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    }))

    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    expect(result.current.progress?.status).toBe('done')

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── waitForBackend: times out after max attempts ──

  it('shows done after max poll attempts even without healthy response', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const BACKEND_POLL_MAX = 90
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })

    // Always return "starting" — never "ok"
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'starting' }),
      })
    ))

    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through all 90 attempts
    for (let i = 0; i < BACKEND_POLL_MAX + 1; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    // After timeout, should still show done
    expect(result.current.progress?.status).toBe('done')
    expect(result.current.progress?.progress).toBe(100)

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── WebSocket constructor throws — catch block in connect() ──

})
