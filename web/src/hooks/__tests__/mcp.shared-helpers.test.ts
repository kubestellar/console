/**
 * Unit tests for shared MCP helper modules (Issue #21037)
 *  - hooks/mcp/sharedImpl.constants  (pure functions + constants)
 *  - hooks/mcp/sharedImpl.demo       (demo cluster data factory)
 *  - hooks/mcp/sharedImpl.connection (WebSocket connection management)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories — created before any module import
// ---------------------------------------------------------------------------

const { mockIsDemoToken, mockIsBackendUnavailable, mockIsWebDriverAutomation } = vi.hoisted(() => ({
  mockIsDemoToken: vi.fn(() => Promise.resolve(false)),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockIsWebDriverAutomation: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Module mocks — must appear before module imports
// ---------------------------------------------------------------------------

vi.mock('../../lib/demoMode', () => ({
  isDemoToken: () => mockIsDemoToken(),
  isDemoMode: vi.fn(() => false),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(() => () => {}),
}))

vi.mock('../../lib/api', () => ({
  isBackendUnavailable: () => mockIsBackendUnavailable(),
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn(() =>
    Promise.resolve({ url: 'ws://localhost:8585/ws', protocols: [] })
  ),
}))

vi.mock('../mcp/wsDetect', () => ({
  isWebDriverAutomation: () => mockIsWebDriverAutomation(),
  isLikelyWsError: vi.fn(() => false),
  resolveAgentWsUrl: vi.fn(() => 'ws://localhost:8585/ws'),
}))

vi.mock('../mcp/agentFetch', () => ({
  getStoredAgentToken: vi.fn(() => 'test-token'),
  getLocalAgentURL: vi.fn(() => 'http://localhost:8585'),
  AGENT_TOKEN_STORAGE_KEY: 'kc-agent-token',
  agentFetch: vi.fn(),
  getAgentToken: vi.fn(() => Promise.resolve('test-token')),
  setAgentToken: vi.fn(),
  clearAgentToken: vi.fn(),
  _resetAgentTokenState: vi.fn(),
}))

vi.mock('../mcp/sharedImpl.state', () => ({
  clusterCache: {
    clusters: [],
    consecutiveFailures: 0,
    isFailed: false,
    isLoading: false,
    isRefreshing: false,
    error: null,
    lastUpdated: null,
    lastRefresh: null,
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// ---------------------------------------------------------------------------
// Module imports (after vi.mock declarations)
// ---------------------------------------------------------------------------

import {
  getEffectiveInterval,
  CLUSTER_POLL_INTERVAL_MS,
  GPU_POLL_INTERVAL_MS,
  CACHE_TTL_MS,
  CLUSTER_NOTIFY_DEBOUNCE_MS,
  MIN_REFRESH_INDICATOR_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  MAX_HEALTH_CHECK_FAILURES,
  MAX_DISTRIBUTION_FAILURES,
  HEALTH_CHECK_CONCURRENCY,
  WS_BACKEND_RECHECK_INTERVAL,
} from '../mcp/sharedImpl.constants'

import { getDemoClusters } from '../mcp/sharedImpl.demo'

import {
  sharedWebSocket,
  connectSharedWebSocket,
  resetAuthFailed,
  cleanupSharedWebSocket,
  setFullFetchClustersImpl,
} from '../mcp/sharedImpl.connection'

// ---------------------------------------------------------------------------
// sharedImpl.constants — getEffectiveInterval
// ---------------------------------------------------------------------------

describe('sharedImpl.constants – getEffectiveInterval', () => {
  it('returns base interval when failures is 0', () => {
    expect(getEffectiveInterval(1000, 0)).toBe(1000)
  })

  it('returns base interval when failures is negative', () => {
    expect(getEffectiveInterval(1000, -1)).toBe(1000)
  })

  it('uses default of 0 failures when second arg omitted', () => {
    expect(getEffectiveInterval(60_000)).toBe(60_000)
  })

  it('doubles interval after 1 consecutive failure', () => {
    expect(getEffectiveInterval(1000, 1)).toBe(2000)
  })

  it('applies 4× multiplier after 2 consecutive failures', () => {
    expect(getEffectiveInterval(1000, 2)).toBe(4000)
  })

  it('applies 8× multiplier after 3 consecutive failures', () => {
    expect(getEffectiveInterval(1000, 3)).toBe(8000)
  })

  it('caps exponent at 5 (failures > 5 still use 2^5 = 32×)', () => {
    expect(getEffectiveInterval(1000, 5)).toBe(32_000)
    expect(getEffectiveInterval(1000, 6)).toBe(32_000)
    expect(getEffectiveInterval(1000, 50)).toBe(32_000)
  })

  it('caps at MAX_BACKOFF_INTERVAL_MS (600 000 ms)', () => {
    // 100 000 × 2^5 = 3 200 000 > 600 000 → capped
    expect(getEffectiveInterval(100_000, 5)).toBe(600_000)
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.constants — exported constant values
// ---------------------------------------------------------------------------

describe('sharedImpl.constants – exported constant values', () => {
  it('CLUSTER_POLL_INTERVAL_MS is 60 000', () => {
    expect(CLUSTER_POLL_INTERVAL_MS).toBe(60_000)
  })

  it('GPU_POLL_INTERVAL_MS is 30 000', () => {
    expect(GPU_POLL_INTERVAL_MS).toBe(30_000)
  })

  it('CACHE_TTL_MS equals CLUSTER_POLL_INTERVAL_MS', () => {
    expect(CACHE_TTL_MS).toBe(CLUSTER_POLL_INTERVAL_MS)
  })

  it('CLUSTER_NOTIFY_DEBOUNCE_MS is a positive number', () => {
    expect(CLUSTER_NOTIFY_DEBOUNCE_MS).toBeGreaterThan(0)
  })

  it('MIN_REFRESH_INDICATOR_MS is 500', () => {
    expect(MIN_REFRESH_INDICATOR_MS).toBe(500)
  })

  it('MAX_RECONNECT_ATTEMPTS is 3', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(3)
  })

  it('RECONNECT_BASE_DELAY_MS is 5000', () => {
    expect(RECONNECT_BASE_DELAY_MS).toBe(5000)
  })

  it('MAX_HEALTH_CHECK_FAILURES is a positive integer', () => {
    expect(MAX_HEALTH_CHECK_FAILURES).toBeGreaterThan(0)
  })

  it('MAX_DISTRIBUTION_FAILURES is a positive integer', () => {
    expect(MAX_DISTRIBUTION_FAILURES).toBeGreaterThan(0)
  })

  it('HEALTH_CHECK_CONCURRENCY is a positive integer', () => {
    expect(HEALTH_CHECK_CONCURRENCY).toBeGreaterThan(0)
  })

  it('WS_BACKEND_RECHECK_INTERVAL is a positive number', () => {
    expect(WS_BACKEND_RECHECK_INTERVAL).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.demo — getDemoClusters
// ---------------------------------------------------------------------------

describe('sharedImpl.demo – getDemoClusters', () => {
  it('returns a non-empty array', () => {
    const clusters = getDemoClusters()
    expect(clusters.length).toBeGreaterThan(0)
  })

  it('all clusters have isDemo: true', () => {
    const clusters = getDemoClusters()
    expect(clusters.every(c => c.isDemo === true)).toBe(true)
  })

  it('includes a kind cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'kind')).toBe(true)
  })

  it('includes a minikube cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'minikube')).toBe(true)
  })

  it('includes an EKS cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'eks')).toBe(true)
  })

  it('includes a GKE cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'gke')).toBe(true)
  })

  it('includes an AKS cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'aks')).toBe(true)
  })

  it('includes an OpenShift cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.distribution === 'openshift')).toBe(true)
  })

  it('includes at least one unhealthy cluster', () => {
    const clusters = getDemoClusters()
    expect(clusters.some(c => c.healthy === false)).toBe(true)
  })

  it('all clusters have non-empty name, context, and source fields', () => {
    const clusters = getDemoClusters()
    for (const c of clusters) {
      expect(c.name).toBeTruthy()
      expect(c.context).toBeTruthy()
      expect(c.source).toBeTruthy()
    }
  })

  it('all clusters have positive nodeCount and podCount', () => {
    const clusters = getDemoClusters()
    for (const c of clusters) {
      expect(c.nodeCount).toBeGreaterThan(0)
      expect(c.podCount).toBeGreaterThan(0)
    }
  })

  it('all clusters have positive cpuCores and memoryGB', () => {
    const clusters = getDemoClusters()
    for (const c of clusters) {
      expect(c.cpuCores).toBeGreaterThan(0)
      expect(c.memoryGB).toBeGreaterThan(0)
    }
  })

  it('each call returns a fresh array (no shared reference)', () => {
    const a = getDemoClusters()
    const b = getDemoClusters()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.connection — cleanupSharedWebSocket
// ---------------------------------------------------------------------------

describe('sharedImpl.connection – cleanupSharedWebSocket', () => {
  beforeEach(() => {
    sharedWebSocket.reconnectAttempts = 2
    sharedWebSocket.connecting = true
    sharedWebSocket.authFailed = false
  })

  afterEach(() => {
    cleanupSharedWebSocket()
  })

  it('resets connecting flag to false', () => {
    cleanupSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('resets reconnectAttempts to 0', () => {
    cleanupSharedWebSocket()
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
  })

  it('sets reconnectTimeout to null', () => {
    sharedWebSocket.reconnectTimeout = setTimeout(() => {}, 60_000)
    cleanupSharedWebSocket()
    expect(sharedWebSocket.reconnectTimeout).toBeNull()
  })

  it('closes and nullifies an open WebSocket', () => {
    const mockWs = { close: vi.fn(), readyState: WebSocket.OPEN }
    sharedWebSocket.ws = mockWs as unknown as WebSocket
    cleanupSharedWebSocket()
    expect(mockWs.close).toHaveBeenCalledOnce()
    expect(sharedWebSocket.ws).toBeNull()
  })

  it('does not throw when ws is already null', () => {
    sharedWebSocket.ws = null
    expect(() => cleanupSharedWebSocket()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.connection — resetAuthFailed
// ---------------------------------------------------------------------------

describe('sharedImpl.connection – resetAuthFailed', () => {
  beforeEach(() => {
    cleanupSharedWebSocket()
    mockIsDemoToken.mockResolvedValue(true) // prevent real WS in reconnect
    vi.clearAllMocks()
    mockIsDemoToken.mockResolvedValue(true)
  })

  afterEach(() => {
    cleanupSharedWebSocket()
  })

  it('is a no-op when authFailed is already false', () => {
    sharedWebSocket.authFailed = false
    resetAuthFailed()
    expect(sharedWebSocket.authFailed).toBe(false)
  })

  it('clears authFailed when it was true', () => {
    sharedWebSocket.authFailed = true
    mockIsDemoToken.mockResolvedValueOnce(true)
    resetAuthFailed()
    expect(sharedWebSocket.authFailed).toBe(false)
  })

  it('resets reconnectAttempts to 0 when clearing auth failure', () => {
    sharedWebSocket.authFailed = true
    sharedWebSocket.reconnectAttempts = 3
    mockIsDemoToken.mockResolvedValueOnce(true)
    resetAuthFailed()
    expect(sharedWebSocket.reconnectAttempts).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.connection — setFullFetchClustersImpl
// ---------------------------------------------------------------------------

describe('sharedImpl.connection – setFullFetchClustersImpl', () => {
  it('stores the provided implementation without throwing', () => {
    const impl = vi.fn(() => Promise.resolve())
    expect(() => setFullFetchClustersImpl(impl)).not.toThrow()
  })

  it('accepts a no-op implementation', () => {
    expect(() => setFullFetchClustersImpl(() => Promise.resolve())).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// sharedImpl.connection — connectSharedWebSocket early-return guards
// ---------------------------------------------------------------------------

describe('sharedImpl.connection – connectSharedWebSocket early returns', () => {
  beforeEach(() => {
    cleanupSharedWebSocket()
    sharedWebSocket.authFailed = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupSharedWebSocket()
  })

  it('returns early and leaves connecting=false when isDemoToken() is true', async () => {
    mockIsDemoToken.mockResolvedValueOnce(true)
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('returns early when isWebDriverAutomation() is true', async () => {
    mockIsDemoToken.mockResolvedValueOnce(false)
    mockIsWebDriverAutomation.mockReturnValueOnce(true)
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('returns early when already connecting', async () => {
    mockIsDemoToken.mockResolvedValueOnce(false)
    mockIsWebDriverAutomation.mockReturnValueOnce(false)
    sharedWebSocket.connecting = true
    await connectSharedWebSocket()
    // Still true: returned early before modifying connecting
    expect(sharedWebSocket.connecting).toBe(true)
  })

  it('returns early when authFailed is true', async () => {
    mockIsDemoToken.mockResolvedValueOnce(false)
    mockIsWebDriverAutomation.mockReturnValueOnce(false)
    sharedWebSocket.authFailed = true
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('returns early when isBackendUnavailable() is true', async () => {
    mockIsDemoToken.mockResolvedValueOnce(false)
    mockIsWebDriverAutomation.mockReturnValueOnce(false)
    mockIsBackendUnavailable.mockReturnValueOnce(true)
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })

  it('stops and marks unavailable when MAX_RECONNECT_ATTEMPTS exceeded', async () => {
    mockIsDemoToken.mockResolvedValueOnce(false)
    mockIsWebDriverAutomation.mockReturnValueOnce(false)
    mockIsBackendUnavailable.mockReturnValueOnce(false)
    sharedWebSocket.reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    await connectSharedWebSocket()
    expect(sharedWebSocket.connecting).toBe(false)
  })
})
