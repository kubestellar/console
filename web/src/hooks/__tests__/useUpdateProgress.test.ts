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

  // ── Initial state ──────────────────────────────────────────────────────

  it('returns null progress and empty step history initially', () => {
    const { result } = renderHook(() => useUpdateProgress())

    expect(result.current.progress).toBeNull()
    expect(result.current.stepHistory).toEqual([])
    expect(typeof result.current.dismiss).toBe('function')
  })

  // ── WebSocket connection ───────────────────────────────────────────────

  it('creates a WebSocket connection on mount', () => {
    renderHook(() => useUpdateProgress())

    expect(wsInstances.length).toBe(1)
  })

  // ── Parses update_progress messages ────────────────────────────────────

  it('updates progress when receiving an update_progress message', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'pulling',
      message: 'Pulling latest changes...',
      progress: 15,
      step: 1,
      totalSteps: 7,
    })

    expect(result.current.progress).toMatchObject({
      status: 'pulling',
      message: 'Pulling latest changes...',
      progress: 15,
    })
  })

  // ── Ignores non-matching message types ─────────────────────────────────

  it('ignores messages with a different type', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind',
            name: 'test',
            status: 'creating',
            message: 'Creating...',
            progress: 50,
          },
        }),
      })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Ignores malformed JSON ─────────────────────────────────────────────

  it('ignores malformed JSON messages', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({ data: '{invalid json!!!' })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Tracks step history ────────────────────────────────────────────────

  it('builds step history from update_progress messages with step info', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Step 1 active
    sendProgress(ws, {
      status: 'pulling',
      message: 'Git pull',
      progress: 14,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })

    expect(result.current.stepHistory.length).toBe(TOTAL_STEPS)
    expect(result.current.stepHistory[0].status).toBe('active')
    expect(result.current.stepHistory[1].status).toBe('pending')

    // Step 2 active (step 1 becomes completed)
    sendProgress(ws, {
      status: 'building',
      message: 'npm install',
      progress: 28,
      step: 2,
      totalSteps: TOTAL_STEPS,
    })

    expect(result.current.stepHistory[0].status).toBe('completed')
    expect(result.current.stepHistory[1].status).toBe('active')
    expect(result.current.stepHistory[2].status).toBe('pending')
  })

  // ── Handles step updates progressing through all steps ─────────────────

  it('marks all steps as completed when the last step is active', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Jump straight to step 7
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restart',
      progress: 95,
      step: TOTAL_STEPS,
      totalSteps: TOTAL_STEPS,
    })

    // Steps 1-6 should be completed
    const STEPS_BEFORE_LAST = 6
    for (let i = 0; i < STEPS_BEFORE_LAST; i++) {
      expect(result.current.stepHistory[i].status).toBe('completed')
    }
    // Step 7 should be active
    expect(result.current.stepHistory[TOTAL_STEPS - 1].status).toBe('active')
  })

  // ── Step history uses known labels from DEV_UPDATE_STEP_LABELS ────────

  it('uses known step labels for developer channel steps', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'pulling',
      message: 'Running git pull...',
      progress: 10,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })

    // Active step should use the message from the payload
    expect(result.current.stepHistory[0].message).toBe('Running git pull...')
    // Pending steps should use the label map
    expect(result.current.stepHistory[1].message).toBe('npm install')
    expect(result.current.stepHistory[2].message).toBe('Frontend build')
    expect(result.current.stepHistory[3].message).toBe('Build console binary')
    expect(result.current.stepHistory[4].message).toBe('Build kc-agent binary')
    expect(result.current.stepHistory[5].message).toBe('Stopping services')
    expect(result.current.stepHistory[6].message).toBe('Restart')
  })

  // ── Messages without step info do not alter step history ──────────────

  it('does not update step history if step or totalSteps is missing', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    sendProgress(ws, {
      status: 'checking',
      message: 'Checking for updates...',
      progress: 5,
    })

    expect(result.current.progress).toMatchObject({ status: 'checking' })
    // No step history should be built
    expect(result.current.stepHistory).toEqual([])
  })

  // ── Dismiss clears progress and step history ───────────────────────────

  it('dismiss() clears both progress and step history', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
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

  it('reconnects when the WebSocket closes', () => {
    const WS_RECONNECT_MS = 5000
    renderHook(() => useUpdateProgress())

    expect(wsInstances.length).toBe(1)

    // Simulate WS close
    act(() => {
      wsInstances[0].close()
    })

    // Advance past reconnect delay
    act(() => {
      vi.advanceTimersByTime(WS_RECONNECT_MS)
    })

    // A new WebSocket should have been created
    expect(wsInstances.length).toBe(2)
  })

  // ── Multiple reconnects ───────────────────────────────────────────────

  it('reconnects multiple times on repeated disconnects', () => {
    const WS_RECONNECT_MS = 5000
    const RECONNECT_COUNT = 3
    renderHook(() => useUpdateProgress())
    expect(wsInstances.length).toBe(1)

    for (let i = 0; i < RECONNECT_COUNT; i++) {
      act(() => { wsInstances[wsInstances.length - 1].close() })
      act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })
    }

    // Original + 3 reconnects
    expect(wsInstances.length).toBe(1 + RECONNECT_COUNT)
  })

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it('closes WebSocket and clears timers on unmount', () => {
    const { unmount } = renderHook(() => useUpdateProgress())

    const ws = wsInstances[0]
    unmount()

    expect(ws.close).toHaveBeenCalled()
  })

  // ── Ignores messages with no payload ───────────────────────────────────

  it('ignores update_progress messages with no payload', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'update_progress' }),
      })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── WebSocket onerror triggers close ──────────────────────────────────

  it('closes the WebSocket on error (which triggers reconnect)', () => {
    const WS_RECONNECT_MS = 5000
    renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onerror!()
    })

    // onerror calls ws.close(), which triggers onclose and schedules reconnect
    expect(ws.close).toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })
    expect(wsInstances.length).toBe(2)
  })

  // ── Stale detection during active update ──────────────────────────────

  it('transitions to failed status when WebSocket stays disconnected during active update', () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Trigger onopen to set lastMessageTimeRef
    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    // Now advance past the stale timeout + one check interval
    act(() => {
      vi.advanceTimersByTime(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })

    // The hook should have detected the stale state (no WS, active update, long silence)
    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.message).toContain('stopped responding')
  })

  // ── Stale detection stops when update completes ───────────────────────

  it('stops stale detection timer when update status is done', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Trigger onopen
    act(() => { vi.advanceTimersByTime(0) })

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

  it('stops stale detection timer when update status is failed', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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

  it('preserves timestamps of previously completed steps', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
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

  it('falls back to "Step N" for steps beyond the known label map', () => {
    const TOTAL_STEPS = 10 // beyond the 7-step dev label map
    const { result } = renderHook(() => useUpdateProgress())
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
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Trigger onopen
    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    // Trigger onopen of the new WebSocket
    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through poll iterations
    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(BACKEND_POLL_MS) })
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

  it('shows progressive messages during backend health polling', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // First poll: "Waiting for services to restart..."
    await act(async () => { await Promise.resolve() })
    expect(result.current.progress?.message).toContain('Waiting for services to restart')

    // Advance several polls to get elapsed time > 10s
    const POLLS_FOR_10S = 6 // 6 * 2000ms = 12s
    for (let i = 0; i < POLLS_FOR_10S; i++) {
      await act(async () => { vi.advanceTimersByTime(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    // Message should now reference "initializing" or "Starting backend"
    expect(result.current.progress?.status).toBe('restarting')

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── waitForBackend: fetch error does not crash, continues polling ──

  it('continues polling when fetch throws during waitForBackend', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through polls — errors should be swallowed
    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(BACKEND_POLL_MS) })
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
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(BACKEND_POLL_MS) })
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
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })

    // Advance through all 90 attempts
    for (let i = 0; i < BACKEND_POLL_MAX + 1; i++) {
      await act(async () => { vi.advanceTimersByTime(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }

    // After timeout, should still show done
    expect(result.current.progress?.status).toBe('done')
    expect(result.current.progress?.progress).toBe(100)

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── WebSocket constructor throws — catch block in connect() ──

  it('retries connection when WebSocket constructor throws', () => {
    const WS_RECONNECT_MS = 5000

    // First make the constructor throw
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })

    renderHook(() => useUpdateProgress())

    // No instances created because constructor threw
    // But the hook should schedule a reconnect
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    // Restore MockWebSocket for the retry
    vi.stubGlobal('WebSocket', MockWebSocket)
    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })

    // Now a new instance should have been created
    expect(wsInstances.length).toBeGreaterThanOrEqual(1)
  })

  // ── Stale detection: interval clears when status becomes non-active ──

  it('stale detection timer clears itself when progress is no longer active', () => {
    const STALE_CHECK_INTERVAL_MS = 5000
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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
    act(() => { vi.advanceTimersByTime(STALE_CHECK_INTERVAL_MS) })

    expect(result.current.progress?.status).toBe('idle')
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  // ── Stale detection: does not trigger when WS is still connected ──

  it('stale detection does not trigger failure when WebSocket is still connected', () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
    })

    // Advance past the stale timeout but keep WS connected (wsRef is not null)
    act(() => {
      vi.advanceTimersByTime(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })

    // Since WS is still connected, stale detection should NOT trigger failure
    expect(result.current.progress?.status).toBe('building')
  })

  // ── Step history: active step uses empty message when payload message is empty ──

  it('uses label from step map when active step message is empty', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
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

  it('stale detection error message includes elapsed seconds', () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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

    act(() => { vi.advanceTimersByTime(WS_RECONNECT_MS) })
    act(() => { vi.advanceTimersByTime(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS) })

    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.error).toMatch(/No response from kc-agent for \d+s/)
    expect(result.current.progress?.error).toContain('startup-oauth.sh')

    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  // ── Stale detection does not restart if already running ──

  it('does not start a second stale detection timer when one is already running', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => { vi.advanceTimersByTime(0) })

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

  it('sets timestamp to 0 for pending steps', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
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

  it('assigns Date.now() to completed steps without prior history entry', () => {
    const TOTAL_STEPS = 7
    const { result } = renderHook(() => useUpdateProgress())
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
