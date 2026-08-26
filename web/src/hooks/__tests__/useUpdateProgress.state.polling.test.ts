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
  it('shows progressive messages during backend health polling', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'starting' }),
      })
    ))
    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    await act(async () => { await Promise.resolve() })
    expect(result.current.progress?.message).toMatch(
      /Waiting for services to restart|Starting backend services/
    )
    const POLLS_FOR_10S = 6 // 6 * 2000ms = 12s
    for (let i = 0; i < POLLS_FOR_10S; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }
    expect(result.current.progress?.status).toBe('restarting')
    expect(result.current.progress?.message).toMatch(
      /Starting backend services|Backend initializing/
    )
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  it('continues polling when fetch throws during waitForBackend', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })
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
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  it('continues polling when /health returns non-ok response', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
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
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  it('shows done after max poll attempts even without healthy response', async () => {
    const WS_RECONNECT_MS = 5000
    const BACKEND_POLL_MS = 2000
    const BACKEND_POLL_MAX = 90
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'restarting',
      message: 'Restarting...',
      progress: 85,
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'starting' }),
      })
    ))
    act(() => { ws.close() })
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    const ws2 = wsInstances[wsInstances.length - 1]
    act(() => {
      if (ws2.onopen) ws2.onopen()
    })
    for (let i = 0; i < BACKEND_POLL_MAX + 1; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(BACKEND_POLL_MS) })
      await act(async () => { await Promise.resolve() })
    }
    expect(result.current.progress?.status).toBe('done')
    expect(result.current.progress?.progress).toBe(100)
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  it('retries connection when WebSocket constructor throws', async () => {
    const WS_RECONNECT_MS = 5000
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('Connection refused') }
    })
    await renderUpdateProgressHook()
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    vi.stubGlobal('WebSocket', MockWebSocket)
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    expect(wsInstances.length).toBeGreaterThanOrEqual(1)
  })
  it('stale detection timer clears itself when progress is no longer active', async () => {
    const STALE_CHECK_INTERVAL_MS = 5000
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
      status: 'idle',
      message: 'Idle',
      progress: 0,
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(STALE_CHECK_INTERVAL_MS) })
    expect(result.current.progress?.status).toBe('idle')
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
  it('stale detection does not trigger failure when WebSocket is still connected', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 50,
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS)
    })
    expect(result.current.progress?.status).toBe('building')
  })
  it('uses label from step map when active step message is empty', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    sendProgress(ws, {
      status: 'pulling',
      message: '', // empty message
      progress: 10,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })
    expect(result.current.stepHistory[0].message).toBe('Git pull')
  })
  it('stale detection error message includes elapsed seconds', async () => {
    const STALE_TIMEOUT_MS = 45_000
    const STALE_CHECK_INTERVAL_MS = 5_000
    const WS_RECONNECT_MS = 5_000
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
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
    await act(async () => { await vi.advanceTimersByTimeAsync(WS_RECONNECT_MS) })
    await flushMicrotasks()
    await act(async () => { await vi.advanceTimersByTimeAsync(STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS) })
    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.error).toMatch(/No response from kc-agent for \d+s/)
    expect(result.current.progress?.error).toContain('startup-oauth.sh')
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  it('does not start a second stale detection timer when one is already running', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    await flushMicrotasks()
    sendProgress(ws, {
      status: 'pulling',
      message: 'Pulling...',
      progress: 10,
    })
    const callCountAfterFirst = setIntervalSpy.mock.calls.length
    sendProgress(ws, {
      status: 'building',
      message: 'Building...',
      progress: 40,
    })
    expect(setIntervalSpy.mock.calls.length).toBe(callCountAfterFirst)
    expect(result.current.progress?.status).toBe('building')
    setIntervalSpy.mockRestore()
  })
  it('sets timestamp to 0 for pending steps', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    sendProgress(ws, {
      status: 'pulling',
      message: 'Git pull',
      progress: 14,
      step: 1,
      totalSteps: TOTAL_STEPS,
    })
    for (let i = 1; i < TOTAL_STEPS; i++) {
      expect(result.current.stepHistory[i].status).toBe('pending')
      expect(result.current.stepHistory[i].timestamp).toBe(0)
    }
  })
  it('assigns Date.now() to completed steps without prior history entry', async () => {
    const TOTAL_STEPS = 7
    const { result } = await renderUpdateProgressHook()
    const ws = wsInstances[0]
    sendProgress(ws, {
      status: 'building',
      message: 'Frontend build',
      progress: 42,
      step: 3,
      totalSteps: TOTAL_STEPS,
    })
    expect(result.current.stepHistory[0].status).toBe('completed')
    expect(result.current.stepHistory[0].timestamp).toBeGreaterThan(0)
    expect(result.current.stepHistory[1].status).toBe('completed')
    expect(result.current.stepHistory[1].timestamp).toBeGreaterThan(0)
  })
})
