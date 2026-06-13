/**
 * Supplemental coverage for hooks/mcp/sharedImpl.connection.ts
 *
 * The existing sharedImpl.connection.test.ts covers all early-exit guards.
 * This file covers the WebSocket event handlers that are reached only after
 * a real (mock) WebSocket is created:
 *   - ws.onopen  (sends auth token, or closes if token missing)
 *   - ws.onmessage  (authenticated / error / kubeconfig_changed / clusters_updated)
 *   - ws.onerror  (calls isLikelyWsError, resets connecting flag)
 *   - ws.onclose  (resets state, schedules reconnect with exponential backoff)
 *   - setTimeout reconnect callback (increments attempt, calls connectSharedWebSocket)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/demoMode', () => ({
  isDemoToken: vi.fn(() => false),
}))

vi.mock('../../../lib/api', () => ({
  isBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../../../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn(async (url: string) => ({ url, protocols: [] })),
}))

vi.mock('../wsDetect', () => ({
  isLikelyWsError: vi.fn(() => false),
  isWebDriverAutomation: vi.fn(() => false),
  resolveAgentWsUrl: vi.fn(() => 'ws://localhost:3210/ws'),
}))

vi.mock('../agentFetch', () => ({
  getStoredAgentToken: () => sessionStorage.getItem('agent-token') || '',
}))

vi.mock('../sharedImpl.constants', () => ({
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_BASE_DELAY_MS: 100,
  WS_BACKEND_RECHECK_INTERVAL: 60_000,
}))

vi.mock('../sharedImpl.state', () => ({
  clusterCache: { consecutiveFailures: 0, isFailed: false },
}))

// ── MockWebSocket ─────────────────────────────────────────────────────────────

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.OPEN
  sentMessages: string[] = []

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  send(data: string) { this.sentMessages.push(data) }
  close() { this.readyState = MockWebSocket.CLOSED }

  triggerOpen() { this.onopen?.(new Event('open')) }
  triggerMessage(data: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
  triggerError() { this.onerror?.(new Event('error')) }
  triggerClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code }))
  }
}

let lastWsInstance: MockWebSocket | null = null

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { isLikelyWsError } from '../wsDetect'
import {
  connectSharedWebSocket,
  cleanupSharedWebSocket,
  sharedWebSocket,
  setFullFetchClustersImpl,
} from '../sharedImpl.connection'

const mockIsLikelyWsError = vi.mocked(isLikelyWsError)

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetSharedWsState() {
  sharedWebSocket.ws = null
  sharedWebSocket.connecting = false
  sharedWebSocket.reconnectAttempts = 0
  sharedWebSocket.authFailed = false
  if (sharedWebSocket.reconnectTimeout) {
    clearTimeout(sharedWebSocket.reconnectTimeout)
    sharedWebSocket.reconnectTimeout = null
  }
}

/** Connect and return the captured MockWebSocket instance. */
async function connectAndGetWs(): Promise<MockWebSocket> {
  lastWsInstance = null
  vi.stubGlobal('WebSocket', class extends MockWebSocket {
    constructor(_url: string) {
      super()
      lastWsInstance = this
    }
  })
  await connectSharedWebSocket()
  if (!lastWsInstance) throw new Error('WebSocket was not instantiated')
  return lastWsInstance
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useRealTimers()
  vi.useFakeTimers()
  // Advance past WS_BACKEND_RECHECK_INTERVAL (60_000ms) so module-level
  // wsBackendUnavailable flag from a previous test's MAX-reconnect guard
  // doesn't block new connections.
  vi.advanceTimersByTime(61_000)
  vi.restoreAllMocks()
  resetSharedWsState()
  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('agent-token', 'test-token-123')
})

afterEach(() => {
  cleanupSharedWebSocket()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── ws.onopen ─────────────────────────────────────────────────────────────────

describe('ws.onopen — with valid token', () => {
  it('sends auth message when readyState is OPEN', async () => {
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    expect(ws.sentMessages).toHaveLength(1)
    expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: 'auth', token: 'test-token-123' })
  })

  it('does not send message when readyState is not OPEN', async () => {
    const ws = await connectAndGetWs()
    ws.readyState = MockWebSocket.CONNECTING // simulate race condition
    ws.triggerOpen()
    expect(ws.sentMessages).toHaveLength(0)
  })
})

describe('ws.onopen — missing token', () => {
  it('calls ws.close() when no token in sessionStorage', async () => {
    sessionStorage.clear() // remove the agent-token
    const ws = await connectAndGetWs()
    const closeSpy = vi.spyOn(ws, 'close')
    ws.triggerOpen()
    expect(closeSpy).toHaveBeenCalled()
    expect(ws.sentMessages).toHaveLength(0)
  })
})

// ── ws.onmessage ──────────────────────────────────────────────────────────────

describe('ws.onmessage — authenticated', () => {
  it('sets sharedWebSocket.ws, clears connecting flag and resets attempts', async () => {
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    ws.triggerMessage({ type: 'authenticated' })

    expect(sharedWebSocket.ws).toBe(ws)
    expect(sharedWebSocket.connecting).toBe(false)
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
  })
})

describe('ws.onmessage — error type', () => {
  it('closes the WebSocket on error message', async () => {
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    const closeSpy = vi.spyOn(ws, 'close')
    ws.triggerMessage({ type: 'error', message: 'unauthorized' })
    expect(closeSpy).toHaveBeenCalled()
  })
})

describe('ws.onmessage — kubeconfig_changed', () => {
  it('resets clusterCache failure tracking and calls fullFetchClustersImpl', async () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    setFullFetchClustersImpl(mockFetch)

    const ws = await connectAndGetWs()
    ws.triggerOpen()
    ws.triggerMessage({ type: 'kubeconfig_changed' })
    expect(mockFetch).toHaveBeenCalled()
  })
})

describe('ws.onmessage — clusters_updated', () => {
  it('resets clusterCache failure tracking and calls fullFetchClustersImpl', async () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    setFullFetchClustersImpl(mockFetch)

    const ws = await connectAndGetWs()
    ws.triggerOpen()
    ws.triggerMessage({ type: 'clusters_updated' })
    expect(mockFetch).toHaveBeenCalled()
  })

  it('does not throw when fullFetchClustersImpl is null', async () => {
    setFullFetchClustersImpl(null as unknown as () => Promise<void>)
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    expect(() => ws.triggerMessage({ type: 'clusters_updated' })).not.toThrow()
  })
})

describe('ws.onmessage — malformed JSON', () => {
  it('silently ignores parse errors', async () => {
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    // Fire raw bad JSON via the handler directly
    expect(() => {
      ws.onmessage?.(new MessageEvent('message', { data: '{ not valid json' }))
    }).not.toThrow()
  })
})

// ── ws.onerror ────────────────────────────────────────────────────────────────

describe('ws.onerror', () => {
  it('calls isLikelyWsError with the event', async () => {
    const ws = await connectAndGetWs()
    ws.triggerError()
    expect(mockIsLikelyWsError).toHaveBeenCalled()
  })

  it('resets the connecting flag', async () => {
    const ws = await connectAndGetWs()
    // sharedWebSocket.connecting was set to true during connect
    ws.triggerError()
    expect(sharedWebSocket.connecting).toBe(false)
  })
})

// ── ws.onclose ────────────────────────────────────────────────────────────────

describe('ws.onclose — reconnect scheduling', () => {
  it('nulls out sharedWebSocket.ws and resets connecting', async () => {
    const ws = await connectAndGetWs()
    ws.triggerOpen()
    ws.triggerMessage({ type: 'authenticated' })
    ws.triggerClose()

    expect(sharedWebSocket.ws).toBeNull()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('schedules a reconnect timeout when attempts < MAX', async () => {
    const ws = await connectAndGetWs()
    ws.triggerClose()
    expect(sharedWebSocket.reconnectTimeout).not.toBeNull()
  })

  it('does not schedule reconnect when attempts are already at MAX', async () => {
    // Connect normally first
    const ws = await connectAndGetWs()
    // Bump attempts to MAX before closing
    sharedWebSocket.reconnectAttempts = 5
    ws.triggerClose()
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
  })

  it('reconnect callback increments attempts and calls connectSharedWebSocket again', async () => {
    const ws = await connectAndGetWs()
    ws.triggerClose()

    // Capture the new WS after reconnect fires
    let reconnectWs: MockWebSocket | null = null
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(_url: string) {
        super()
        reconnectWs = this
      }
    })

    await vi.runAllTimersAsync()

    expect(sharedWebSocket.reconnectAttempts).toBe(1)
    expect(reconnectWs).not.toBeNull()
  })

  it('clears any existing reconnect timeout before scheduling a new one', async () => {
    const ws = await connectAndGetWs()
    // Simulate an existing pending timeout
    const fakeTimeout = setTimeout(() => {}, 99999)
    sharedWebSocket.reconnectTimeout = fakeTimeout
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    ws.triggerClose()

    expect(clearSpy).toHaveBeenCalledWith(fakeTimeout)
  })
})
