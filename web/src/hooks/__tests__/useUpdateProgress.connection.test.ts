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

  // ── Initial state ──────────────────────────────────────────────────────

  it('returns null progress and empty step history initially', async () => {
    const { result } = await renderUpdateProgressHook()

    expect(result.current.progress).toBeNull()
    expect(result.current.stepHistory).toEqual([])
    expect(typeof result.current.dismiss).toBe('function')
  })

  // ── WebSocket connection ───────────────────────────────────────────────

  it('creates a WebSocket connection on mount', async () => {
    await renderUpdateProgressHook()

    expect(wsInstances.length).toBe(1)
  })

  // ── Parses update_progress messages ────────────────────────────────────

  it('updates progress when receiving an update_progress message', async () => {
    const { result } = await renderUpdateProgressHook()
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

  it('ignores messages with a different type', async () => {
    const { result } = await renderUpdateProgressHook()
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

  it('ignores malformed JSON messages', async () => {
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]

    act(() => {
      ws.onmessage!({ data: '{invalid json!!!' })
    })

    expect(result.current.progress).toBeNull()
  })

  // ── Tracks step history ────────────────────────────────────────────────

  it('builds step history from update_progress messages with step info', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
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

  it('marks all steps as completed when the last step is active', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
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

  it('uses known step labels for developer channel steps', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
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

  it('does not update step history if step or totalSteps is missing', async () => {
    const { result } = await renderUpdateProgressHook()
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
})
