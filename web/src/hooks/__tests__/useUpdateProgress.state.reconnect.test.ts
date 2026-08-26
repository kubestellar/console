import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 0)
  }
}
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
vi.stubGlobal('WebSocket', MockWebSocket)
import { useUpdateProgress } from '../useUpdateProgress'
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
  it('reconnects when the WebSocket closes', async () => {
    const WS_RECONNECT_MS = 5000
    await renderUpdateProgressHook()
    expect(wsInstances.length).toBe(1)
    act(() => {
      wsInstances[0].close()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS)
    })
    await flushMicrotasks()
    expect(wsInstances.length).toBe(2)
  })
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
    expect(wsInstances.length).toBe(1 + RECONNECT_COUNT)
  })
  it('closes WebSocket and clears timers on unmount', async () => {
    const { unmount } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })
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
  it('closes the WebSocket on error (which triggers reconnect)', async () => {
    const WS_RECONNECT_MS = 5000
    await renderUpdateProgressHook()
    const ws = wsInstances[0]
    act(() => {
      ws.onerror!()
    })
    expect(ws.close).toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    expect(wsInstances.length).toBe(2)
  })
  it('transitions to failed status when WebSocket stays disconnected during active update', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
      step: 3,
      totalSteps: 7,
    })
    expect(result.current.progress?.status).toBe('building')
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })
    act(() => {
      ws.readyState = MockWebSocket.CLOSED
      if (ws.onclose) ws.onclose()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })
    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.message).toContain('stopped responding')
  })
  it('stops stale detection timer when update status is done', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
      step: 3,
      totalSteps: 7,
    })
    sendProgress(ws, {
      status: 'done',
      message: 'Update complete',
      progress: 100,
      step: 7,
      totalSteps: 7,
    })
    expect(result.current.progress?.status).toBe('done')
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
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
  it('preserves timestamps of previously completed steps', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    sendProgress(ws, {
      status: 'pulling', message: 'Git pull', progress: 14,
      step: 1, totalSteps: TOTAL_STEPS,
    })
    const step1Timestamp = result.current.stepHistory[0].timestamp
    sendProgress(ws, {
      status: 'building', message: 'npm install', progress: 28,
      step: 2, totalSteps: TOTAL_STEPS,
    })
    expect(result.current.stepHistory[0].status).toBe('completed')
    expect(result.current.stepHistory[0].timestamp).toBe(step1Timestamp)
  })
  it('falls back to "Step N" for steps beyond the known label map', async () => {
    const TOTAL_STEPS = 10 // beyond the 7-step dev label map
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    sendProgress(ws, {
      status: 'building', message: 'Extra step', progress: 80,
      step: 9, totalSteps: TOTAL_STEPS,
    })
    expect(result.current.stepHistory[7].message).toBe('Step 8')
    expect(result.current.stepHistory[8].message).toBe('Extra step') // active step uses payload message
    expect(result.current.stepHistory[9].message).toBe('Step 10')
  })
  it('triggers waitForBackend when WebSocket reconnects during restarting status', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
      step: 7,
      totalSteps: 7,
    })
    expect(result.current.progress?.status).toBe('restarting')
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
    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })
    for (let i = 0; i < 5; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }
    expect(result.current.progress?.status).toBe('done')
    expect(result.current.progress?.message).toContain('Update complete')
    expect(result.current.progress?.progress).toBe(100)
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
})
