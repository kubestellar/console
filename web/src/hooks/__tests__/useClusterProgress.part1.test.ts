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

describe('useClusterProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetWsInstances()
    vi.stubGlobal('WebSocket', MockWebSocket)
    mockGetWsAuthParams.mockImplementation((url: string) => Promise.resolve({ url, protocols: [] }))
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

  it('passes bearer auth subprotocols to WebSocket when provided', async () => {
    mockGetWsAuthParams.mockImplementationOnce((url: string) => Promise.resolve({ url, protocols: ['bearer.cluster-token'] }))

    await renderClusterProgressHook()

    expect(wsInstances[0].protocols).toEqual(['bearer.cluster-token'])
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

})
