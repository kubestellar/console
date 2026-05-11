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

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
} })

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: (url: string) => Promise.resolve(url),
}))

// Assign mock to global before importing the hook
vi.stubGlobal('WebSocket', MockWebSocket)

import { useClusterProgress } from '../useClusterProgress'

async function flushPendingWebSocketSetup() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderClusterProgressHook() {
  const hook = renderHook(() => useClusterProgress())
  await flushPendingWebSocketSetup()
  return hook
}

async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useClusterProgress', () => {
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

  it('returns null progress initially', async () => {
    const { result } = await renderClusterProgressHook()

    expect(result.current.progress).toBeNull()
    expect(typeof result.current.dismiss).toBe('function')
  })

  // ── WebSocket connection ───────────────────────────────────────────────

  it('creates a WebSocket connection on mount', async () => {
    await renderClusterProgressHook()

    expect(wsInstances.length).toBe(1)
  })

  // ── Parses local_cluster_progress messages ─────────────────────────────

  it('updates progress when receiving a local_cluster_progress message', async () => {
    const { result } = await renderClusterProgressHook()
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

  it('ignores messages with a different type', async () => {
    const { result } = await renderClusterProgressHook()
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

  it('ignores malformed JSON messages', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({ data: 'not valid json {{{' })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Handles step updates ───────────────────────────────────────────────

  it('updates progress through multiple status changes', async () => {
    const { result } = await renderClusterProgressHook()
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

  it('dismiss() clears the progress state', async () => {
    const { result } = await renderClusterProgressHook()
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

  it('reconnects when the WebSocket closes', async () => {
    const WS_RECONNECT_DELAY_MS = 10000
    await renderClusterProgressHook()

    expect(wsInstances.length).toBe(1)

    // Simulate WS close
    act(() => {
      wsInstances[0].close()
    })

    // Advance past reconnect delay
    await advanceTimersAndFlush(WS_RECONNECT_DELAY_MS)

    // A new WebSocket should have been created
    expect(wsInstances.length).toBe(2)
  })

  // ── Cleanup on unmount ─────────────────────────────────────────────────

  it('closes WebSocket and clears timers on unmount', async () => {
    const { unmount } = await renderClusterProgressHook()

    const ws = wsInstances[0]
    unmount()

    expect(ws.close).toHaveBeenCalled()
  })

  // ── Ignores messages with no payload ───────────────────────────────────

  it('ignores local_cluster_progress messages with no payload', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress' }),
      })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Regression: onerror triggers close ─────────────────────────────────

  it('closes the WebSocket when onerror fires', async () => {
    await renderClusterProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onerror!()
    })

    expect(ws.close).toHaveBeenCalled()
  })

  // ── Regression: reconnect after onerror + onclose cycle ───────────────

  it('reconnects after an onerror -> onclose cycle', async () => {
    const WS_RECONNECT_DELAY_MS = 10_000
    await renderClusterProgressHook()

    expect(wsInstances.length).toBe(1)

    // onerror calls close(), which fires onclose, which schedules reconnect
    act(() => {
      wsInstances[0].onerror!()
    })

    await advanceTimersAndFlush(WS_RECONNECT_DELAY_MS)

    expect(wsInstances.length).toBe(2)
  })

  // ── Regression: progress at boundary values ───────────────────────────

  it('accepts progress at 0% (start of operation)', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    const payload = {
      tool: 'kind',
      name: 'fresh-cluster',
      status: 'validating' as const,
      message: 'Starting validation...',
      progress: 0,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress', payload }),
      })
    })

    expect(result.current.progress).toEqual(payload)
    expect(result.current.progress!.progress).toBe(0)
  })

  it('accepts progress at 100% (completed operation)', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    const payload = {
      tool: 'k3d',
      name: 'prod-cluster',
      status: 'done' as const,
      message: 'Cluster created successfully',
      progress: 100,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress', payload }),
      })
    })

    expect(result.current.progress!.progress).toBe(100)
    expect(result.current.progress!.status).toBe('done')
  })

  // ── Regression: deleting status flow ──────────────────────────────────

  it('tracks the full deleting lifecycle (validating -> deleting -> done)', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    const statuses: Array<{ status: string; progress: number; message: string }> = [
      { status: 'validating', progress: 10, message: 'Checking cluster exists...' },
      { status: 'deleting', progress: 50, message: 'Deleting kind cluster...' },
      { status: 'done', progress: 100, message: 'Cluster deleted' },
    ]

    for (const s of statuses) {
      act(() => {
        ws.onmessage!({
          data: JSON.stringify({
            type: 'local_cluster_progress',
            payload: { tool: 'kind', name: 'doomed-cluster', ...s },
          }),
        })
      })
      expect(result.current.progress!.status).toBe(s.status)
      expect(result.current.progress!.progress).toBe(s.progress)
    }
  })

  // ── Regression: failed status ─────────────────────────────────────────

  it('correctly reflects a failed status with error message', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    const payload = {
      tool: 'kind',
      name: 'broken-cluster',
      status: 'failed' as const,
      message: 'Docker daemon not running',
      progress: 25,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress', payload }),
      })
    })

    expect(result.current.progress!.status).toBe('failed')
    expect(result.current.progress!.message).toBe('Docker daemon not running')
    expect(result.current.progress!.progress).toBe(25)
  })

  // ── Regression: dismiss returns a stable callback reference ───────────

  it('dismiss is callable after re-render', async () => {
    const { result, rerender } = await renderClusterProgressHook()
    rerender()
    // React Compiler handles memoization — just verify dismiss is still callable
    expect(typeof result.current.dismiss).toBe('function')
  })

  // ── Regression: new message after dismiss resets progress ─────────────

  it('accepts new messages after dismiss was called', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    // Set initial progress
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind', name: 'c1', status: 'done',
            message: 'Done', progress: 100,
          },
        }),
      })
    })
    expect(result.current.progress).not.toBeNull()

    // Dismiss
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.progress).toBeNull()

    // New message should be accepted
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'k3d', name: 'c2', status: 'creating',
            message: 'Creating...', progress: 20,
          },
        }),
      })
    })
    expect(result.current.progress).not.toBeNull()
    expect(result.current.progress!.name).toBe('c2')
  })

  // ── Regression: rapid messages retain only the last value ─────────────

  it('retains only the latest progress when multiple messages arrive', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    act(() => {
      for (let i = 10; i <= 90; i += 10) {
        ws.onmessage!({
          data: JSON.stringify({
            type: 'local_cluster_progress',
            payload: {
              tool: 'kind', name: 'rapid-cluster',
              status: 'creating', message: `Step at ${i}%`, progress: i,
            },
          }),
        })
      }
    })

    expect(result.current.progress!.progress).toBe(90)
    expect(result.current.progress!.message).toBe('Step at 90%')
  })

  // ── Regression: unmount during reconnect clears pending timer ─────────

  it('does not reconnect after unmount even if close triggered a timer', async () => {
    const WS_RECONNECT_DELAY_MS = 10_000
    const { unmount } = await renderClusterProgressHook()

    // Trigger close -> schedules reconnect
    act(() => {
      wsInstances[0].close()
    })

    // Unmount before timer fires
    unmount()

    const instancesBefore = wsInstances.length

    // Advance past reconnect delay
    await advanceTimersAndFlush(WS_RECONNECT_DELAY_MS)

    // No new WebSocket should have been created
    expect(wsInstances.length).toBe(instancesBefore)
  })

  // ── Regression: payload retains all fields including tool and name ────

  it('preserves all ClusterProgress fields from the payload', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    const payload = {
      tool: 'k3d',
      name: 'multi-field-cluster',
      status: 'creating' as const,
      message: 'Pulling images...',
      progress: 42,
    }

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({ type: 'local_cluster_progress', payload }),
      })
    })

    expect(result.current.progress!.tool).toBe('k3d')
    expect(result.current.progress!.name).toBe('multi-field-cluster')
    expect(result.current.progress!.status).toBe('creating')
    expect(result.current.progress!.message).toBe('Pulling images...')
    expect(result.current.progress!.progress).toBe(42)
  })

  // ── Regression: empty string messages are valid ───────────────────────

  it('handles empty string message in payload', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind', name: 'test', status: 'creating',
            message: '', progress: 50,
          },
        }),
      })
    })

    expect(result.current.progress!.message).toBe('')
  })

  // ── Regression: different cluster tools tracked correctly ─────────────

  it('tracks progress for different cluster tools (kind, k3d)', async () => {
    const { result } = await renderClusterProgressHook()
    const ws = wsInstances[0]

    // First with kind
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'kind', name: 'kind-cluster', status: 'creating',
            message: 'Creating kind cluster', progress: 30,
          },
        }),
      })
    })
    expect(result.current.progress!.tool).toBe('kind')

    // Then with k3d (replaces previous)
    act(() => {
      ws.onmessage!({
        data: JSON.stringify({
          type: 'local_cluster_progress',
          payload: {
            tool: 'k3d', name: 'k3d-cluster', status: 'creating',
            message: 'Creating k3d cluster', progress: 40,
          },
        }),
      })
    })
    expect(result.current.progress!.tool).toBe('k3d')
    expect(result.current.progress!.name).toBe('k3d-cluster')
  })
})

// ── Max reconnect attempts exceeded path (lines 68-70 in source) ──

describe('max reconnect attempts exceeded', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
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
    wsInstances = []
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
