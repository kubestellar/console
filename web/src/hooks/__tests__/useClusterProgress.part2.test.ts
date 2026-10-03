/**
 * Tests for useClusterProgress hook.
 *
 * Validates WebSocket connection, message parsing for local_cluster_progress
 * events, dismiss behaviour, and cleanup on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
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
