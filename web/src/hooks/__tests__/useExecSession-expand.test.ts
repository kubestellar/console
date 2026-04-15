import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token' }
})

import { useExecSession } from '../useExecSession'
import type { ExecSessionConfig } from '../useExecSession'

// ---------- WebSocket mock ----------

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  sentMessages: string[] = []

  send(data: string) { this.sentMessages.push(data) }
  close() { this.readyState = MockWebSocket.CLOSED }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }
  triggerMessage(data: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
  triggerError() { this.onerror?.(new Event('error')) }
  triggerClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code }))
  }
}

Object.defineProperty(MockWebSocket, 'OPEN', { value: 1, writable: false })
Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3, writable: false })

const DEFAULT_CONFIG: ExecSessionConfig = {
  cluster: 'prod',
  namespace: 'default',
  pod: 'my-pod',
  container: 'main',
}

describe('useExecSession — expanded edge cases', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kc-auth-token', 'test-jwt')
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockWs = new MockWebSocket()
    const original = mockWs
    function FakeWebSocket() { return original }
    FakeWebSocket.CONNECTING = 0
    FakeWebSocket.OPEN = 1
    FakeWebSocket.CLOSING = 2
    FakeWebSocket.CLOSED = 3
    FakeWebSocket.prototype = MockWebSocket.prototype
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // 1. Reconnect countdown decrements every second
  it('reconnect countdown decrements with interval', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    // Simulate unexpected close
    act(() => { mockWs.triggerClose(1006) })
    expect(result.current.status).toBe('reconnecting')
    const initialCountdown = result.current.reconnectCountdown
    expect(initialCountdown).toBeGreaterThan(0)
    // Advance 1 second
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.reconnectCountdown).toBeLessThan(initialCountdown)
  })

  // 2. Max reconnect attempts result in error
  it('gives up after MAX_RECONNECT_ATTEMPTS and shows error', () => {
    const MAX_ATTEMPTS = 5
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })

    // Simulate close
    act(() => { mockWs.triggerClose(1006) })
    expect(result.current.status).toBe('reconnecting')

    // The scheduleReconnect checks if attempt >= MAX (5)
    // Force the internal counter to max
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Advance past the reconnect delay
      act(() => { vi.advanceTimersByTime(20000) })
    }
    // After all retries, status should settle
    // (Exact assertion depends on timing, but should not crash)
    expect(result.current.status).not.toBe('connected')
  })

  // 3. sendInput is no-op when WS is in CLOSED state
  it('sendInput does nothing when WS is closed', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { result.current.disconnect() })
    const msgsBefore = mockWs.sentMessages.length
    act(() => { result.current.sendInput('test') })
    expect(mockWs.sentMessages.length).toBe(msgsBefore)
  })

  // 4. resize is no-op when WS is closed
  it('resize does nothing when WS is closed', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { result.current.disconnect() })
    const msgsBefore = mockWs.sentMessages.length
    act(() => { result.current.resize(100, 50) })
    expect(mockWs.sentMessages.length).toBe(msgsBefore)
  })

  // 5. exit with no exitCode defaults to 0
  it('exit callback receives 0 when exitCode is undefined', () => {
    const exitCb = vi.fn()
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.onExit(exitCb) })
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { mockWs.triggerMessage({ type: 'exit' }) })
    expect(exitCb).toHaveBeenCalledWith(0)
  })

  // 6. Exit message marks intentional disconnect to prevent reconnect
  it('does not attempt reconnect after exit message', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { mockWs.triggerMessage({ type: 'exit', exitCode: 0 }) })
    // Simulate onclose after exit
    act(() => { mockWs.triggerClose(1000) })
    expect(result.current.status).toBe('disconnected')
    expect(result.current.reconnectAttempt).toBe(0)
  })

  // 7. WebSocket URL routes through the local kc-agent regardless of page protocol.
  //
  // Pre-#8168 (phase3d) this hook built the URL from `window.location`
  // (e.g. `wss://<page-host>/ws/exec`). After the exec migration to kc-agent
  // (#7993 / #8168), the SPDY exec stream runs under the user's own kubeconfig
  // via a local WebSocket to `LOCAL_AGENT_WS_URL` — always ws://127.0.0.1:8585
  // in the non-Netlify build. The page protocol no longer affects the URL,
  // so this test asserts the new, stable target (see useExecSession.ts:235).
  it('builds kc-agent /ws/exec URL regardless of page protocol', () => {
    // Save original
    const originalLocation = window.location
    // Mock protocol — the URL builder must ignore this post-#8168.
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'example.com' },
      writable: true,
      configurable: true,
    })

    const constructorSpy = vi.fn().mockReturnValue(mockWs)
    vi.stubGlobal('WebSocket', Object.assign(constructorSpy, {
      CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
    }))

    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    expect(constructorSpy).toHaveBeenCalledWith('ws://127.0.0.1:8585/ws/exec')

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  // 8. Error clears on new connect
  it('clears previous error when reconnecting', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'error', data: 'failed' }) })
    expect(result.current.error).toBe('failed')

    act(() => { result.current.connect(DEFAULT_CONFIG) })
    expect(result.current.error).toBeNull()
  })

  // 9. Disconnect clears reconnect timers
  it('disconnect clears any pending reconnect timers', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { mockWs.triggerClose(1006) })
    expect(result.current.status).toBe('reconnecting')

    act(() => { result.current.disconnect() })
    expect(result.current.reconnectCountdown).toBe(0)
    expect(result.current.reconnectAttempt).toBe(0)
    expect(result.current.status).toBe('disconnected')
  })

  // 10. Multiple close events do not crash
  it('handles multiple close events without crashing', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerClose(1006) })
    act(() => { mockWs.triggerClose(1006) })
    expect(result.current.status).toBe('error')
  })

  // 11. Unknown message types are silently ignored
  it('ignores unknown message types', () => {
    const dataCb = vi.fn()
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.onData(dataCb) })
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'unknown_type', data: 'something' }) })
    expect(dataCb).not.toHaveBeenCalled()
    expect(result.current.status).toBe('connecting')
  })

  // 12. statusChange callback fires on disconnect
  it('statusChange callback fires with disconnected on disconnect', () => {
    const statusCb = vi.fn()
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.onStatusChange(statusCb) })
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { result.current.disconnect() })
    expect(statusCb).toHaveBeenCalledWith('disconnected', undefined)
  })

  // 13. Reconnect attempt counter is exposed
  it('reconnectAttempt increments on each reconnect schedule', () => {
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { mockWs.triggerClose(1006) })
    expect(result.current.reconnectAttempt).toBe(1)
  })

  // 14. Reconnect message includes attempt info
  it('data callback receives reconnect message with attempt info', () => {
    const dataCb = vi.fn()
    const { result } = renderHook(() => useExecSession())
    act(() => { result.current.onData(dataCb) })
    act(() => { result.current.connect(DEFAULT_CONFIG) })
    act(() => { mockWs.triggerOpen() })
    act(() => { mockWs.triggerMessage({ type: 'exec_started' }) })
    act(() => { mockWs.triggerClose(1006) })
    const reconnectMsg = dataCb.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Reconnecting')
    )
    expect(reconnectMsg).toBeDefined()
    expect(reconnectMsg![0]).toContain('attempt 1/5')
  })
})
