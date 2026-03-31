/**
 * Tests for useClusterProgress hook.
 *
 * Validates WebSocket connection, message parsing for local_cluster_progress
 * events, dismiss behaviour, and cleanup on unmount.
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
}))

// Assign mock to global before importing the hook
Object.defineProperty(globalThis, 'WebSocket', {
  writable: true,
  value: MockWebSocket,
})

import { useClusterProgress } from '../useClusterProgress'

describe('useClusterProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Initial state ──────────────────────────────────────────────────────

  it('returns null progress initially', () => {
    const { result } = renderHook(() => useClusterProgress())

    expect(result.current.progress).toBeNull()
    expect(typeof result.current.dismiss).toBe('function')
  })

  // ── WebSocket connection ───────────────────────────────────────────────

  it('creates a WebSocket connection on mount', () => {
    renderHook(() => useClusterProgress())

    expect(wsInstances.length).toBe(1)
  })

  // ── Parses local_cluster_progress messages ─────────────────────────────

  it('updates progress when receiving a local_cluster_progress message', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    const payload = {
      tool: 'kind',
      name: 'test-cluster',
      status: 'creating',
      message: 'Creating kind cluster...',
      progress: 30,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress', payload }),
      })
    })

    expect(result.current.progress).toEqual(payload)
  })

  // ── Ignores non-matching message types ─────────────────────────────────

  it('ignores messages with a different type', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'update_progress',
          payload: { status: 'building', message: 'Building...', progress: 50 },
        }),
      })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Ignores malformed JSON ─────────────────────────────────────────────

  it('ignores malformed JSON messages', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({ data: 'not valid json {{{' })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Handles step updates ───────────────────────────────────────────────

  it('updates progress through multiple status changes', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    // Step 1: validating
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind',
            name: 'my-cluster',
            status: 'validating',
            message: 'Validating configuration...',
            progress: 10,
          },
        }),
      })
    })
    expect(result.current.progress!.status).toBe('validating')
    expect(result.current.progress!.progress).toBe(10)

    // Step 2: creating
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind',
            name: 'my-cluster',
            status: 'creating',
            message: 'Creating cluster...',
            progress: 50,
          },
        }),
      })
    })
    expect(result.current.progress!.status).toBe('creating')
    expect(result.current.progress!.progress).toBe(50)

    // Step 3: done
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind',
            name: 'my-cluster',
            status: 'done',
            message: 'Cluster created successfully',
            progress: 100,
          },
        }),
      })
    })
    expect(result.current.progress!.status).toBe('done')
    expect(result.current.progress!.progress).toBe(100)
  })

  // ── Dismiss clears progress ────────────────────────────────────────────

  it('dismiss() clears the progress state', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind',
            name: 'test',
            status: 'done',
            message: 'Done',
            progress: 100,
          },
        }),
      })
    })
    expect(result.current.progress).not.toBeNull()

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.progress).toBeNull()
  })

  // ── Reconnects on WebSocket close ──────────────────────────────────────

  it('reconnects when the WebSocket closes', () => {
    const WS_RECONNECT_DELAY_MS = 10000
    renderHook(() => useClusterProgress())

    expect(wsInstances.length).toBe(1)

    // Simulate WS close
    act(() => {
      wsInstances[0].close()
    })

    // Advance past reconnect delay
    act(() => {
      vi.advanceTimersByTime(WS_RECONNECT_DELAY_MS)
    })

    // A new WebSocket should have been created
    expect(wsInstances.length).toBe(2)
  })

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it('closes WebSocket and clears timers on unmount', () => {
    const { unmount } = renderHook(() => useClusterProgress())

    const ws = wsInstances[0]
    unmount()

    expect(ws.close).toHaveBeenCalled()
  })

  // ── Ignores messages with no payload ───────────────────────────────────

  it('ignores local_cluster_progress messages with no payload', () => {
    const { result } = renderHook(() => useClusterProgress())
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress' }),
      })
    })

    expect(result.current.progress).toBeNull()
  })
})
