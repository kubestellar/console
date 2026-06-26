/**
 * Tests for hooks/mcp/sharedImpl.connection.ts — WebSocket connection management.
 *
 * Covers:
 * - setFullFetchClustersImpl: stores the impl reference
 * - cleanupSharedWebSocket: clears timeout, closes ws, resets state
 * - connectSharedWebSocket early-exit guards:
 *   - demo token → skip
 *   - webdriver automation → skip
 *   - already connecting → skip
 *   - already open → skip
 *   - backend unavailable → skip
 *   - exceeded max reconnect attempts → stop
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  RECONNECT_BASE_DELAY_MS: 1000,
  WS_BACKEND_RECHECK_INTERVAL: 60_000,
}))

vi.mock('../sharedImpl.state', () => ({
  clusterCache: { consecutiveFailures: 0, isFailed: false },
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { isDemoToken } from '../../../lib/demoMode'
import { isBackendUnavailable } from '../../../lib/api'
import { isWebDriverAutomation } from '../wsDetect'
import {
  setFullFetchClustersImpl,
  cleanupSharedWebSocket,
  connectSharedWebSocket,
  sharedWebSocket,
} from '../sharedImpl.connection'

const mockIsDemoToken = vi.mocked(isDemoToken)
const mockIsBackendUnavailable = vi.mocked(isBackendUnavailable)
const mockIsWebDriver = vi.mocked(isWebDriverAutomation)

beforeEach(() => {
  vi.clearAllMocks()
  // Reset shared WebSocket state before each test
  sharedWebSocket.ws = null
  sharedWebSocket.connecting = false
  sharedWebSocket.reconnectAttempts = 0
  if (sharedWebSocket.reconnectTimeout) {
    clearTimeout(sharedWebSocket.reconnectTimeout)
    sharedWebSocket.reconnectTimeout = null
  }
})

// ── setFullFetchClustersImpl ──────────────────────────────────────────────────

describe('setFullFetchClustersImpl', () => {
  it('stores the provided impl without throwing', () => {
    const impl = vi.fn().mockResolvedValue(undefined)
    expect(() => setFullFetchClustersImpl(impl)).not.toThrow()
  })
})

// ── cleanupSharedWebSocket ────────────────────────────────────────────────────

describe('cleanupSharedWebSocket', () => {
  it('clears a pending reconnect timeout', () => {
    const tid = setTimeout(() => {}, 999_999)
    sharedWebSocket.reconnectTimeout = tid
    cleanupSharedWebSocket()
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
  })

  it('closes an open WebSocket', () => {
    const mockWs = { close: vi.fn() } as unknown as WebSocket
    sharedWebSocket.ws = mockWs
    cleanupSharedWebSocket()
    expect(mockWs.close).toHaveBeenCalledOnce()
    expect(sharedWebSocket.ws).toBeNull()
  })

  it('resets connecting flag', () => {
    sharedWebSocket.connecting = true
    cleanupSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('resets reconnectAttempts to 0', () => {
    sharedWebSocket.reconnectAttempts = 3
    cleanupSharedWebSocket()
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
  })

  it('is safe to call when ws is null', () => {
    sharedWebSocket.ws = null
    expect(() => cleanupSharedWebSocket()).not.toThrow()
  })
})

// ── connectSharedWebSocket early-exit guards ──────────────────────────────────

describe('connectSharedWebSocket — early-exit guards', () => {
  it('skips if isDemoToken returns true', async () => {
    mockIsDemoToken.mockReturnValue(true)
    await connectSharedWebSocket()
    // Should not have set connecting=true
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('skips if isWebDriverAutomation returns true', async () => {
    mockIsWebDriver.mockReturnValue(true)
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('skips if already connecting', async () => {
    sharedWebSocket.connecting = true
    // Should return immediately without attempting WebSocket
    await connectSharedWebSocket()
    // Still connecting (no ws was created that would reset it)
    expect(sharedWebSocket.connecting).toBe(true)
  })

  it('skips if isBackendUnavailable returns true', async () => {
    mockIsBackendUnavailable.mockReturnValue(true)
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('stops and marks unavailable when reconnectAttempts >= MAX_RECONNECT_ATTEMPTS', async () => {
    sharedWebSocket.reconnectAttempts = 5 // equals MAX_RECONNECT_ATTEMPTS
    await connectSharedWebSocket()
    // Should have aborted — connecting resets to false
    expect(sharedWebSocket.connecting).toBe(false)
  })
})
