import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import {
  getCachedVersion,
  getStaleCachedVersion,
  setCachedVersion,
  clearCachedVersions,
  createVersionWsHandle,
  VERSION_CACHE_TTL,
  WS_CONNECTION_TIMEOUT_MS,
  VERSION_REQUEST_TIMEOUT_MS,
  VersionWsMessage,
} from '../useUpgradeWebSocket'

// ---------------------------------------------------------------------------
// Mock safeLocalStorage
// ---------------------------------------------------------------------------
const { mockSafeLocalStorage } = vi.hoisted(() => ({
  mockSafeLocalStorage: {
    safeGetJSON: vi.fn((_key: string, fallback: unknown) => fallback),
    safeSetJSON: vi.fn(),
  },
}))

vi.mock('../../lib/safeLocalStorage', () => ({
  safeGetJSON: (...args: unknown[]) => mockSafeLocalStorage.safeGetJSON(...args),
  safeSetJSON: (...args: unknown[]) => mockSafeLocalStorage.safeSetJSON(...args),
}))

// ---------------------------------------------------------------------------
// Mock WebSocket Class
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  CONNECTING = 0
  OPEN = 1
  CLOSING = 2
  CLOSED = 3

  url: string
  readyState: number = 0 // CONNECTING
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3 // CLOSED
  })

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  triggerOpen() {
    this.readyState = 1 // OPEN
    if (this.onopen) this.onopen()
  }

  triggerMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: typeof data === 'string' ? data : JSON.stringify(data),
        })
      )
    }
  }

  triggerError() {
    if (this.onerror) this.onerror()
  }

  triggerClose() {
    this.readyState = 3 // CLOSED
    if (this.onclose) this.onclose()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flush the microtask queue (pending Promises) without advancing fake timers.
 * Named `tick` to make the intent clear at each call-site.
 */
async function tick() {
  await act(async () => {
    await Promise.resolve()
  })
}

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------
const openTrackedWs = vi.fn()
const parseWsMessage = (event: MessageEvent): VersionWsMessage | null => {
  try {
    return JSON.parse(event.data) as VersionWsMessage
  } catch {
    return null
  }
}

beforeEach(() => {
  vi.useRealTimers()
  openTrackedWs.mockReset()

  // Clear in-memory cache before each test to guarantee environment isolation
  clearCachedVersions(['cluster-1', 'cluster-2', 'cluster-3', 'cluster-4'])
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useUpgradeWebSocket — Version cache utilities', () => {
  it('getCachedVersion returns null when no entry exists', () => {
    expect(getCachedVersion('cluster-1')).toBeNull()
  })

  it('getCachedVersion returns version string when entry exists and is within TTL', () => {
    setCachedVersion('cluster-1', 'v1.25.0')
    expect(getCachedVersion('cluster-1')).toBe('v1.25.0')
  })

  it('getCachedVersion returns null when entry exists but TTL has expired', async () => {
    vi.useFakeTimers()
    setCachedVersion('cluster-1', 'v1.25.0')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CACHE_TTL + 1)
    })

    expect(getCachedVersion('cluster-1')).toBeNull()
  })

  it('getStaleCachedVersion returns version even after TTL has expired', async () => {
    vi.useFakeTimers()
    setCachedVersion('cluster-1', 'v1.25.0')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CACHE_TTL + 1)
    })

    expect(getStaleCachedVersion('cluster-1')).toBe('v1.25.0')
  })

  it('getStaleCachedVersion returns null when no entry exists', () => {
    expect(getStaleCachedVersion('cluster-1')).toBeNull()
  })

  it('setCachedVersion stores entry and makes it readable by getCachedVersion', () => {
    setCachedVersion('cluster-2', 'v1.26.0')
    expect(getCachedVersion('cluster-2')).toBe('v1.26.0')
  })

  it('clearCachedVersions removes specified cluster names from cache', () => {
    setCachedVersion('cluster-1', 'v1.25.0')
    setCachedVersion('cluster-2', 'v1.26.0')

    clearCachedVersions(['cluster-1'])

    expect(getCachedVersion('cluster-1')).toBeNull()
    expect(getCachedVersion('cluster-2')).toBe('v1.26.0')
  })

  it('clearCachedVersions is a no-op for cluster names not in cache', () => {
    expect(() => clearCachedVersions(['non-existent-cluster'])).not.toThrow()
    expect(() => clearCachedVersions(null as unknown as string[])).not.toThrow()
    expect(() => clearCachedVersions(undefined as unknown as string[])).not.toThrow()
  })
})

describe('useUpgradeWebSocket — createVersionWsHandle WebSocket lifecycle', () => {
  it('ensureWs opens a WebSocket and resolves when onopen fires', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const ensurePromise = handle.ensureWs()

    await tick()

    mockWs.triggerOpen()

    const wsInstance = await ensurePromise
    expect(wsInstance).toBe(mockWs)
    expect(openTrackedWs).toHaveBeenCalledTimes(1)
  })

  it('ensureWs rejects with "WebSocket error" message when onerror fires', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const ensurePromise = handle.ensureWs()

    await tick()
    mockWs.triggerError()

    await expect(ensurePromise).rejects.toThrow('WebSocket error')
  })

  it(
    'ensureWs rejects with "WebSocket connection timeout" after VERSION_REQUEST_TIMEOUT_MS without onopen',
    async () => {
      vi.useFakeTimers()
      const mockWs = new MockWebSocket('ws://test')
      openTrackedWs.mockResolvedValueOnce(mockWs)

      const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)

      // Capture the rejection into a variable to avoid any unhandled-rejection window.
      // The primary ensureWs() path uses VERSION_REQUEST_TIMEOUT_MS (10 s) for the connection
      // timeout — not WS_CONNECTION_TIMEOUT_MS (5 s), which is only used in the concurrent
      // second-caller interval-check path.
      let caughtError: Error | null = null
      handle.ensureWs().catch((e: Error) => {
        caughtError = e
      })

      await tick()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(VERSION_REQUEST_TIMEOUT_MS)
      })

      // Drain microtasks so the .catch handler above runs
      await tick()

      expect(caughtError).toBeTruthy()
      expect(caughtError!.message).toBe('WebSocket connection timeout')

      // Cancel any leftover timers so they don't leak into subsequent tests
      handle.destroy()
    },
    VERSION_REQUEST_TIMEOUT_MS + 2000 // give the test enough wall-clock time
  )

  it('ensureWs returns existing open WebSocket on second call without creating a new one', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)

    const p1 = handle.ensureWs()
    await tick()
    mockWs.triggerOpen()
    await p1

    const p2 = handle.ensureWs()
    const wsInstance2 = await p2

    expect(wsInstance2).toBe(mockWs)
    expect(openTrackedWs).toHaveBeenCalledTimes(1)
  })

  it('ensureWs rejects immediately if handle has been destroyed', async () => {
    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    handle.destroy()

    await expect(handle.ensureWs()).rejects.toThrow('Handle destroyed')
  })

  it(
    'destroy cancels pending ensure timers — p2 rejects immediately, p1 rejects on connectionTimeout',
    async () => {
      // Scenario: two concurrent ensureWs() calls while the socket is still connecting.
      // After destroy():
      //   - p2 (2nd caller): the pendingEnsureTimers timeout is cancelled; the setInterval
      //     check detects `destroyed` and rejects with 'Handle destroyed'.
      //   - p1 (1st caller): closeWs() is called but the outer promise is only settled by
      //     the connectionTimeout (VERSION_REQUEST_TIMEOUT_MS). Destroying prevents the
      //     socket from staying open, so no stale state mutation happens after unmount (#6206).
      vi.useFakeTimers()
      const mockWs = new MockWebSocket('ws://test')
      openTrackedWs.mockResolvedValue(mockWs)

      const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)

      // Track rejections via .catch so we never have unhandled promise rejections
      const p1Errors: Error[] = []
      const p2Errors: Error[] = []

      const p1 = handle.ensureWs().catch((e: Error) => p1Errors.push(e))

      // Allow the openTrackedWs promise to resolve so the socket is assigned
      await tick()

      // Second caller enters the `if (connecting)` branch — creates a setInterval check
      // and a timeout stored in pendingEnsureTimers
      const p2 = handle.ensureWs().catch((e: Error) => p2Errors.push(e))

      // destroy() cancels pendingEnsureTimers (kills the 5s timeout for p2) and calls
      // closeWs() which nulls out ws and sets connecting=false
      handle.destroy()

      // Advance past WS_CONNECTION_TIMEOUT_MS so p2's interval check fires and detects
      // destroyed=true, then advance to VERSION_REQUEST_TIMEOUT_MS so p1's connectionTimeout
      // also fires — ensuring no stale timer holds open closure references
      await act(async () => {
        await vi.advanceTimersByTimeAsync(VERSION_REQUEST_TIMEOUT_MS)
      })

      // Drain remaining microtasks
      await p1
      await p2

      // p2 must reject as 'Handle destroyed' (the interval check detects destroyed=true)
      expect(p2Errors).toHaveLength(1)
      expect(p2Errors[0].message).toBe('Handle destroyed')

      // p1 rejects via the connectionTimeout — verify it was rejected (not silently dropped)
      expect(p1Errors).toHaveLength(1)
    },
    VERSION_REQUEST_TIMEOUT_MS + 2000 // give the test enough wall-clock headroom
  )
})

describe('useUpgradeWebSocket — fetchClusterVersion', () => {
  it('returns cached version without opening WebSocket when cache is valid', async () => {
    setCachedVersion('cluster-1', 'v1.25.0')
    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)

    const version = await handle.fetchClusterVersion('cluster-1')
    expect(version).toBe('v1.25.0')
    expect(openTrackedWs).not.toHaveBeenCalled()
  })

  it('bypasses cache and fetches via WebSocket when forceRefresh=true', async () => {
    setCachedVersion('cluster-1', 'v1.25.0')
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1', true)

    await tick()
    mockWs.triggerOpen()
    await tick()

    await act(async () => {
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0])
      mockWs.triggerMessage({
        id: sentMsg.id,
        payload: {
          output: JSON.stringify({ serverVersion: { gitVersion: 'v1.26.0' } }),
        },
      })
    })

    const version = await fetchPromise
    expect(version).toBe('v1.26.0')
    expect(openTrackedWs).toHaveBeenCalledTimes(1)
  })

  it('sends correct JSON message format with cluster name and kubectl args', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    handle.fetchClusterVersion('cluster-1')

    await tick()
    mockWs.triggerOpen()
    await tick()

    expect(mockWs.send).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mockWs.send.mock.calls[0][0])
    expect(payload.id).toContain('version-cluster-1')
    expect(payload.type).toBe('kubectl')
    expect(payload.payload).toEqual({
      context: 'cluster-1',
      args: ['version', '-o', 'json'],
    })
  })

  it('resolves with parsed gitVersion from server response payload', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1')

    await tick()
    mockWs.triggerOpen()
    await tick()

    await act(async () => {
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0])
      mockWs.triggerMessage({
        id: sentMsg.id,
        payload: {
          output: JSON.stringify({ serverVersion: { gitVersion: 'v1.27.0' } }),
        },
      })
    })

    const version = await fetchPromise
    expect(version).toBe('v1.27.0')
  })

  it('resolves with null (not throw) when server sends empty payload', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1')

    await tick()
    mockWs.triggerOpen()
    await tick()

    await act(async () => {
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0])
      mockWs.triggerMessage({ id: sentMsg.id, payload: {} })
    })

    const version = await fetchPromise
    expect(version).toBeNull()
  })

  it('resolves with null (not throw) when server sends malformed JSON', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1')

    await tick()
    mockWs.triggerOpen()
    await tick()

    await act(async () => {
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0])
      mockWs.triggerMessage({
        id: sentMsg.id,
        payload: { output: 'NOT_JSON_BODY' },
      })
    })

    const version = await fetchPromise
    expect(version).toBeNull()
  })

  it('resolves with cached version on timeout (fallback behavior)', async () => {
    vi.useFakeTimers()
    setCachedVersion('cluster-1', 'v1.25.0')
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1', true)

    await tick()
    mockWs.triggerOpen()
    await tick()

    // Advance by the request-response timeout to trigger the fallback
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_REQUEST_TIMEOUT_MS)
    })

    const version = await fetchPromise
    expect(version).toBe('v1.25.0')
  })

  it('resolves with null when handle is destroyed before response arrives', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-1')

    await tick()
    mockWs.triggerOpen()
    await tick()

    handle.destroy()

    const version = await fetchPromise
    expect(version).toBeNull()
  })

  it('stores returned version in cache via setCachedVersion', async () => {
    const mockWs = new MockWebSocket('ws://test')
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    const fetchPromise = handle.fetchClusterVersion('cluster-3')

    await tick()
    mockWs.triggerOpen()
    await tick()

    await act(async () => {
      const sentMsg = JSON.parse(mockWs.send.mock.calls[0][0])
      mockWs.triggerMessage({
        id: sentMsg.id,
        payload: {
          output: JSON.stringify({ serverVersion: { gitVersion: 'v1.28.0' } }),
        },
      })
    })

    await fetchPromise
    expect(getCachedVersion('cluster-3')).toBe('v1.28.0')
  })
})

describe('useUpgradeWebSocket — destroy', () => {
  it('destroy closes WebSocket and rejects all pending requests', async () => {
    const mockWs = new MockWebSocket('ws://test')
    mockWs.readyState = 1 // OPEN
    openTrackedWs.mockResolvedValueOnce(mockWs)

    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)

    const pEnsure = handle.ensureWs()
    await tick()
    mockWs.triggerOpen()
    await pEnsure

    const fetchPromise = handle.fetchClusterVersion('cluster-1')
    await tick()

    handle.destroy()

    expect(mockWs.close).toHaveBeenCalledTimes(1)
    const version = await fetchPromise
    expect(version).toBeNull()
  })

  it('destroy is idempotent — calling twice does not throw', () => {
    const handle = createVersionWsHandle(openTrackedWs, parseWsMessage)
    expect(() => {
      handle.destroy()
      handle.destroy()
    }).not.toThrow()
  })
})
