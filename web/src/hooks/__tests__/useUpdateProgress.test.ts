/**
 * Tests for useUpdateProgress hook.
 *
 * Validates WebSocket connection, parsing of update_progress messages,
 * step history tracking, dismiss behaviour, and cleanup on unmount.
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

vi.mock('../../lib/constants/network', () => ({
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
}))

// Assign mock to global before importing the hook
Object.defineProperty(globalThis, 'WebSocket', {
  writable: true,
  value: MockWebSocket,
})

import { useUpdateProgress } from '../useUpdateProgress'

describe('useUpdateProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

    const payload = {
      status: 'pulling',
      message: 'Pulling latest changes...',
      progress: 15,
      step: 1,
      totalSteps: 7,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'update_progress', payload }),
      })
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
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    // Step 1 active
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'update_progress',
          payload: {
            status: 'pulling',
            message: 'Git pull',
            progress: 14,
            step: 1,
            totalSteps: 7,
          },
        }),
      })
    })

    expect(result.current.stepHistory.length).toBe(7)
    expect(result.current.stepHistory[0].status).toBe('active')
    expect(result.current.stepHistory[1].status).toBe('pending')

    // Step 2 active (step 1 becomes completed)
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'update_progress',
          payload: {
            status: 'building',
            message: 'npm install',
            progress: 28,
            step: 2,
            totalSteps: 7,
          },
        }),
      })
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
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'update_progress',
          payload: {
            status: 'restarting',
            message: 'Restart',
            progress: 95,
            step: TOTAL_STEPS,
            totalSteps: TOTAL_STEPS,
          },
        }),
      })
    })

    // Steps 1-6 should be completed
    const STEPS_BEFORE_LAST = 6
    for (let i = 0; i < STEPS_BEFORE_LAST; i++) {
      expect(result.current.stepHistory[i].status).toBe('completed')
    }
    // Step 7 should be active
    expect(result.current.stepHistory[TOTAL_STEPS - 1].status).toBe('active')
  })

  // ── Dismiss clears progress and step history ───────────────────────────

  it('dismiss() clears both progress and step history', () => {
    const { result } = renderHook(() => useUpdateProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'update_progress',
          payload: {
            status: 'done',
            message: 'Update complete',
            progress: 100,
            step: 7,
            totalSteps: 7,
          },
        }),
      })
    })

    expect(result.current.progress).not.toBeNull()
    expect(result.current.stepHistory.length).toBe(7)

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
})
