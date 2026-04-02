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
})
