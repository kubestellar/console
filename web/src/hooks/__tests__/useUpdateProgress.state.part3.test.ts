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
  it('retries connection when WebSocket constructor throws', async () => {
    const WS_RECONNECT_MS = 5000

    // First make the constructor throw
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })

    await renderUpdateProgressHook()

    // No instances created because constructor threw
    // But the hook should schedule a reconnect
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    // Restore MockWebSocket for the retry
    vi.stubGlobal('WebSocket', MockWebSocket)
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    // Now a new instance should have been created
    expect(wsInstances.length).toBeGreaterThanOrEqual(1)
  })

  // ── Stale detection: interval clears when status becomes non-active ──

  it('stale detection timer clears itself when progress is no longer active', async () => {
    const STALE_CHECK_INTERVAL_MS = 5000
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    // Start active update to start stale detection
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
    })

    // Now set status to idle (non-active) without going through done/failed
    sendProgress(ws, {
      status: 'idle',
      message: 'Idle',
      progress: 0,
    })

    // Advance past a stale check interval — the interval callback should detect
    // non-active status and clear itself
    await act(async () => { await vi.advanceTimersByTimeAsync(STALE_CHECK_INTERVAL_MS) })

    expect(result.current.progress?.status).toBe('idle')
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  // ── Stale detection: does not trigger when WS is still connected ──

  it('stale detection does not trigger failure when WebSocket is still connected', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
    })

    // Advance past the stale timeout but keep WS connected (wsRef is not null)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })

    // Since WS is still connected, stale detection should NOT trigger failure
    expect(result.current.progress?.status).toBe('building')
  })

  // ── Step history: active step uses empty message when payload message is empty ──

  it('uses label from step map when active step message is empty', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'pulling',
      message: '', // empty message
      progress: 10,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })

    // Active step with empty message should fall back to label
    expect(result.current.stepHistory[0].message).toBe('Git pull')
  })

  // ── Stale detection: error message includes elapsed time ──

  it('stale detection error message includes elapsed seconds', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'pulling',
      message: 'Pulling...',
      progress: 20,
    })

    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })

    act(() => {
      ws.readyState = MockWebSocket.CLOSED
      if (ws.onclose) ws.onclose()
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    await act(async () => { await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS) })

    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.error).toMatch(/No response from kc-agent for \d+s/)
    expect(result.current.progress?.error).toContain('startup-oauth.sh')

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── Stale detection does not restart if already running ──

  it('does not start a second stale detection timer when one is already running', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    // First active update — starts stale detection
    sendProgress(ws, {
      status: 'pulling',
      message: 'Pulling...',
      progress: 10,
    })

    const callCountAfterFirst = setIntervalSpy.mock.calls.length

    // Another active update message — should NOT start a second timer
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 40,
    })

    // setInterval should not have been called again
    expect(setIntervalSpy.mock.calls.length).toBe(callCountAfterFirst)
    expect(result.current.progress?.status).toBe('building')

    setIntervalSpy.mockRestore()
  })

  // ── Pending steps have timestamp 0 ──

  it('sets timestamp to 0 for pending steps', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'pulling',
      message: 'Git pull',
      progress: 14,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })

    // Steps 2-7 should be pending with timestamp 0
    for (let i = 1; i < TOTAL_STEPS; i++) {
      expect(result.current.stepHistory[i].status).toBe('pending')
      expect(result.current.stepHistory[i].timestamp).toBe(0)
    }
  })

  // ── Completed step without prior entry uses Date.now() ──

  it('assigns Date.now() to completed steps without prior history entry', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    // Jump directly to step 3 — steps 1 and 2 have no prior history entries
    sendProgress(ws, {
      status: 'building',
      message: 'Frontend build',
      progress: 42,
      step: 3,
      totalSteps: TOTAL_STEPS,
    })

    // Steps 1 and 2 should be completed with non-zero timestamps
    expect(result.current.stepHistory[0].status).toBe('completed')
    expect(result.current.stepHistory[0].timestamp).toBeGreaterThan(0)
    expect(result.current.stepHistory[1].status).toBe('completed')
    expect(result.current.stepHistory[1].timestamp).toBeGreaterThan(0)
  })
})
