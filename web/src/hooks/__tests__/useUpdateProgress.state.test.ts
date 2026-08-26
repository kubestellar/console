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

  // ── Dismiss clears progress and step history ───────────────────────────

  it('dismiss() clears both progress and step history', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'done',
      message: 'Update complete',
      progress: 100,
      step: TOTAL_STEPS,
      totalSteps: TOTAL_STEPS,
    })

    expect(result.current.progress).not.toBeNull()
    expect(result.current.stepHistory.length).toBe(TOTAL_STEPS)

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.progress).toBeNull()
    expect(result.current.stepHistory).toEqual([])
  })

  // ── Reconnects on WebSocket close ──────────────────────────────────────

  it('reconnects when the WebSocket closes', async () => {
    const WS_RECONNECT_MS = 5000
    await renderUpdateProgressHook()

    expect(wsInstances.length).toBe(1)

    // Simulate WS close
    act(() => {
      wsInstances[0].close()
    })

    // Advance past reconnect delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS)
    })
    await flushMicrotasks()

    // A new WebSocket should have been created
    expect(wsInstances.length).toBe(2)
  })

  // ── Multiple reconnects ───────────────────────────────────────────────

  it('reconnects multiple times on repeated disconnects', async () => {
    const WS_RECONNECT_MS = 5000
    const RECONNECT_COUNT = 3
    await renderUpdateProgressHook()
    expect(wsInstances.length).toBe(1)

    for (let i = 0; i < RECONNECT_COUNT; i++) {
      act(() => { wsInstances[wsInstances.length - 1].close() })
      await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    }

    // Original + 3 reconnects
    expect(wsInstances.length).toBe(1 + RECONNECT_COUNT)
  })

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it('closes WebSocket and clears timers on unmount', async () => {
    const { unmount } = await renderUpdateProgressHook()

    const ws = wsInstances[0]
    unmount()

    expect(ws.close).toHaveBeenCalled()
  })

  // ── Ignores messages with no payload ───────────────────────────────────

  it('ignores update_progress messages with no payload', async () => {
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'update_progress' }),
      })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── WebSocket onerror triggers close ──────────────────────────────────

  it('closes the WebSocket on error (which triggers reconnect)', async () => {
    const WS_RECONNECT_MS = 5000
    await renderUpdateProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onerror!()
    })

    // onerror calls ws.close(), which triggers onclose and schedules reconnect
    expect(ws.close).toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    expect(wsInstances.length).toBe(2)
  })

  // ── Stale detection during active update ──────────────────────────────

  it('transitions to failed status when WebSocket stays disconnected during active update', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    // Trigger onopen to set lastMessageTimeRef
    await flushMicrotasks()

    // Start an active update
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
      step: 3,
      totalSteps: 7,
    })

    expect(result.current.progress?.status).toBe('building')

    // Make all future WebSocket connections throw (simulating agent being completely down).
    // This causes the `catch` block in connect() to fire, setting wsRef to null and
    // scheduling another reconnect attempt (which also throws, keeping wsRef null).
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })

    // Close the current WebSocket to simulate agent crash
    act(() => {
      ws.readyState = MockWebSocket.CLOSED
      if (ws.onclose) ws.onclose()
    })

    // Advance past reconnect delay (the reconnect attempt throws, wsRef stays null)
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    // Now advance past the stale timeout + one check interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })

    // The hook should have detected the stale state (no WS, active update, long silence)
    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.message).toContain('stopped responding')
  })

  // ── Stale detection stops when update completes ───────────────────────

  it('stops stale detection timer when update status is done', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    // Trigger onopen
    await flushMicrotasks()

    // Start active update (starts stale detection)
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
      step: 3,
      totalSteps: 7,
    })

    // Finish the update
    sendProgress(ws, {
      status: 'done',
      message: 'Update complete',
      progress: 100,
      step: 7,
      totalSteps: 7,
    })

    expect(result.current.progress?.status).toBe('done')
    // clearInterval should have been called for the stale timer
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  // ── Stale detection stops when update fails ───────────────────────────

  it('stops stale detection timer when update status is failed', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    await flushMicrotasks()

    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
    })

    sendProgress(ws, {
      status: 'failed',
      message: 'Build failed',
      progress: 50,
      error: 'npm install failed',
    })

    expect(result.current.progress?.status).toBe('failed')
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  // ── Step history preserves completed step timestamps ───────────────────

  it('preserves timestamps of previously completed steps', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    // Step 1
    sendProgress(ws, {
      status: 'pulling', message: 'Git pull', progress: 14,
      step: 1, totalSteps: TOTAL_STEPS,
    })

    const step1Timestamp = result.current.stepHistory[0].timestamp

    // Step 2 — step 1 becomes completed, its timestamp should be preserved
    sendProgress(ws, {
      status: 'building', message: 'npm install', progress: 28,
      step: 2, totalSteps: TOTAL_STEPS,
    })

    expect(result.current.stepHistory[0].status).toBe('completed')
    expect(result.current.stepHistory[0].timestamp).toBe(step1Timestamp)
  })

  // ── Step history for unknown step labels ──────────────────────────────

  it('falls back to "Step N" for steps beyond the known label map', async () => {
    const TOTAL_STEPS = 10 // beyond the 7-step dev label map
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'building', message: 'Extra step', progress: 80,
      step: 9, totalSteps: TOTAL_STEPS,
    })

    // Steps 8, 9, 10 are beyond the 7-step label map
    expect(result.current.stepHistory[7].message).toBe('Step 8')
    expect(result.current.stepHistory[8].message).toBe('Extra step') // active step uses payload message
    expect(result.current.stepHistory[9].message).toBe('Step 10')
  })

  // ── waitForBackend: reconnect during restarting status triggers health polling ──

  it('triggers waitForBackend when WebSocket reconnects during restarting status', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    // Trigger onopen
    await flushMicrotasks()

    // Set status to restarting
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
      step: 7,
      totalSteps: 7,
    })
    expect(result.current.progress?.status).toBe('restarting')

    // Mock fetch for /health to return "starting" initially, then "ok"
    let fetchCallCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      fetchCallCount++
      if (fetchCallCount <= 2) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'starting' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    }))

    // Close and reconnect — reconnect during restarting triggers waitForBackend
    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()

    // Trigger onopen of the new WebSocket
    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through poll iterations
    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      // Allow pending microtasks (fetch promises) to resolve
      await act(async () => { await Promise.resolve() })
    }

    // After backend returns "ok", progress should be "done"
    expect(result.current.progress?.status).toBe('done')
    expect(result.current.progress?.message).toContain('Update complete')
    expect(result.current.progress?.progress).toBe(100)

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── waitForBackend: progressive messages change over time ──

})
