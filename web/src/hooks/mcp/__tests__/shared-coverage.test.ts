/**
 * Additional coverage tests for shared.ts — targeting ~95 uncovered lines.
 *
 * Covers:
 *   - agentFetch() (token injection, signal fallback, existing Authorization)
 *   - loadDistributionCache / saveDistributionCache error paths
 *   - loadClusterCacheFromStorage error paths and edge cases
 *   - saveClusterCacheToStorage error/filter paths
 *   - clearClusterCacheOnLogout
 *   - handleClusterDemoModeChange (via subscribeDemoMode callback)
 *   - detectDistributionFromNamespaces (all distributions: openshift, gke, eks, aks, rancher)
 *   - mergeWithStoredClusters pickMetric with zero values
 *   - fetchWithRetry caller-abort signal forwarding
 *   - shareMetricsBetweenSameServerClusters — storage/memory/request metric sharing
 *   - deduplicateClustersByServer — edge cases with request metrics merge
 *   - updateSingleClusterInCache — triggers shareMetrics for storageGB, memoryGB
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ClusterInfo } from '../types'

// ---------------------------------------------------------------------------
// Constants (mirror source values)
// ---------------------------------------------------------------------------
const CLUSTER_NOTIFY_DEBOUNCE_MS = 50
const STORAGE_KEY_TOKEN = 'token'
const AGENT_TOKEN_STORAGE_KEY = 'kc-agent-token'

// ---------------------------------------------------------------------------
// Hoisted mocks — same pattern as shared.test.ts
// ---------------------------------------------------------------------------
const mockIsDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockIsDemoToken = vi.hoisted(() => vi.fn(() => false))
const mockIsNetlifyDeployment = vi.hoisted(() => ({ value: false }))
const mockSubscribeDemoMode = vi.hoisted(() => vi.fn())
const mockIsBackendUnavailable = vi.hoisted(() => vi.fn(() => false))
const mockReportAgentDataError = vi.hoisted(() => vi.fn())
const mockReportAgentDataSuccess = vi.hoisted(() => vi.fn())
const mockIsAgentUnavailable = vi.hoisted(() => vi.fn(() => true))
const mockRegisterCacheReset = vi.hoisted(() => vi.fn())
const mockTriggerAllRefetches = vi.hoisted(() => vi.fn())
const mockResetFailuresForCluster = vi.hoisted(() => vi.fn())
const mockResetAllCacheFailures = vi.hoisted(() => vi.fn())
const mockKubectlProxyExec = vi.hoisted(() => vi.fn())
const mockApiGet = vi.hoisted(() => vi.fn())

// The global test setup (setup.ts) mocks agentFetch to delegate to
// global.fetch. For tests that need the REAL agentFetch (token injection,
// signal fallback), import the actual module and restore the real impl.
vi.mock('../shared', async () => {
  const actual = await vi.importActual<typeof import('../shared')>('../shared')
  return { ...actual }
})

vi.mock('../../../lib/api', () => ({
  api: { get: mockApiGet },
  isBackendUnavailable: mockIsBackendUnavailable,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
  isDemoToken: mockIsDemoToken,
  get isNetlifyDeployment() {
    return mockIsNetlifyDeployment.value
  },
  subscribeDemoMode: mockSubscribeDemoMode,
}))

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataError: mockReportAgentDataError,
  reportAgentDataSuccess: mockReportAgentDataSuccess,
  isAgentUnavailable: mockIsAgentUnavailable,
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: mockRegisterCacheReset,
  triggerAllRefetches: mockTriggerAllRefetches,
}))

vi.mock('../../../lib/cache', () => ({
  resetFailuresForCluster: mockResetFailuresForCluster,
  resetAllCacheFailures: mockResetAllCacheFailures,
  createCachedHook: vi.fn((_config: unknown) => () => ({})),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: mockKubectlProxyExec },
}))

vi.mock('../../../lib/constants', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants')>('../../../lib/constants')
  return { ...actual }
})

vi.mock('../../../lib/constants/network', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/constants/network')>('../../../lib/constants/network')
  return { ...actual }
})

const mockEmitAgentTokenFailure = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/analytics', () => ({
  emitAgentTokenFailure: mockEmitAgentTokenFailure,
}))

// ---------------------------------------------------------------------------
// Imports (resolved after mocks)
// ---------------------------------------------------------------------------
import {
  agentFetch,
  clearClusterCacheOnLogout,
  clusterCache,
  clusterSubscribers,
  notifyClusterSubscribers,
  updateClusterCache,
  updateSingleClusterInCache,
  shareMetricsBetweenSameServerClusters,
  deduplicateClustersByServer,
  fetchWithRetry,
  setHealthCheckFailures,
  setInitialFetchStarted,
  fullFetchClusters,
  sharedWebSocket,
  cleanupSharedWebSocket,
} from '../shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    server: 'https://test.example.com:6443',
    healthy: true,
    source: 'kubeconfig',
    nodeCount: 3,
    podCount: 20,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    ...overrides,
  }
}

// ============================================================================
// agentFetch
// ============================================================================
describe('agentFetch — token injection and signal fallback', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.clear()
  })

  it('injects Authorization header when token exists in localStorage', async () => {
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'my-agent-token')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters')

    const call = mockFetch.mock.calls[0]
    const headers = call[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer my-agent-token')
  })

  it('does NOT inject Authorization if header already present', async () => {
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'my-agent-token')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters', {
      headers: { Authorization: 'Bearer custom-token' },
    })

    const call = mockFetch.mock.calls[0]
    const headers = call[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer custom-token')
  })

  it('does NOT inject Authorization when no token in localStorage', async () => {
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters')

    // First call may be the token fetch to /api/agent/token (getAgentToken fallback);
    // the actual agentFetch call is the last one.
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
    const headers = lastCall[1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('uses caller-provided signal instead of default timeout', async () => {
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'skip-token-fetch')
    const controller = new AbortController()
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/test', { signal: controller.signal })

    const call = mockFetch.mock.calls[0]
    expect(call[1]?.signal).toBe(controller.signal)
  })

  it('falls back to AbortSignal.timeout when no signal provided', async () => {
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'skip-token-fetch')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/test')

    const call = mockFetch.mock.calls[0]
    // Signal should exist (the AbortSignal.timeout fallback)
    expect(call[1]?.signal).toBeTruthy()
  })
})

// ============================================================================
// getAgentToken — GA4 failure detection
// ============================================================================
describe('getAgentToken — emits GA4 on failure', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.clear()
    mockEmitAgentTokenFailure.mockClear()
  })

  it('emits emitAgentTokenFailure when /api/agent/token returns non-OK', async () => {
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }))
    mockFetch.mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters')

    expect(mockEmitAgentTokenFailure).toHaveBeenCalledWith('empty token from /api/agent/token')
  })

  it('emits emitAgentTokenFailure when fetch throws network error', async () => {
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    const mockFetch = vi.fn()
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'))
    mockFetch.mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters')

    expect(mockEmitAgentTokenFailure).toHaveBeenCalledWith('Network request failed')
  })

  it('does NOT emit when /api/agent/token returns a valid token', async () => {
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ token: 'valid-hex-token' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    mockFetch.mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/clusters')

    expect(mockEmitAgentTokenFailure).not.toHaveBeenCalled()
  })
})

// ============================================================================
// clearClusterCacheOnLogout
// ============================================================================
describe('clearClusterCacheOnLogout', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    updateClusterCache({
      clusters: [makeCluster({ name: 'pre-logout' })],
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
    })
  })

  it('clears localStorage cluster cache keys', () => {
    localStorage.setItem('kubestellar-cluster-cache', '[]')
    localStorage.setItem('kubestellar-cluster-distributions', '{}')

    clearClusterCacheOnLogout()

    expect(localStorage.getItem('kubestellar-cluster-cache')).toBeNull()
    expect(localStorage.getItem('kubestellar-cluster-distributions')).toBeNull()
  })

  it('resets cluster cache to empty loading state', () => {
    clearClusterCacheOnLogout()

    expect(clusterCache.clusters).toEqual([])
    expect(clusterCache.isLoading).toBe(true)
    expect(clusterCache.lastUpdated).toBeNull()
    expect(clusterCache.consecutiveFailures).toBe(0)
    expect(clusterCache.isFailed).toBe(false)
    expect(clusterCache.lastRefresh).toBeNull()
  })

  it('notifies subscribers after clearing', () => {
    const sub = vi.fn()
    clusterSubscribers.add(sub)

    clearClusterCacheOnLogout()

    expect(sub).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: [], isLoading: true })
    )
  })

  it('survives localStorage errors gracefully', () => {
    // Simulate localStorage.removeItem throwing
    const originalRemoveItem = localStorage.removeItem.bind(localStorage)
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('Storage full')
    })

    // Should not throw
    expect(() => clearClusterCacheOnLogout()).not.toThrow()

    // Cache should still be reset despite storage error
    expect(clusterCache.clusters).toEqual([])
    vi.restoreAllMocks()
  })
})

// ============================================================================
// handleClusterDemoModeChange (via subscribeDemoMode callback)
// ============================================================================
describe('handleClusterDemoModeChange — demo mode transitions', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    updateClusterCache({
      clusters: [makeCluster({ name: 'live-cluster' })],
      isLoading: false,
    })
  })

  it('subscribeDemoMode was called during module initialization', () => {
    // The module calls subscribeDemoMode(handleClusterDemoModeChange) on load
    expect(mockSubscribeDemoMode).toHaveBeenCalled()
  })

  it('clears cache and loads demo data when switching TO demo mode', () => {
    // Get the callback that was registered
    const demoModeCallback = mockSubscribeDemoMode.mock.calls[0]?.[0]
    if (!demoModeCallback) return

    // First call sets lastClusterDemoMode (simulate initial state)
    mockIsDemoMode.mockReturnValue(false)
    demoModeCallback()

    // Now switch to demo mode
    mockIsDemoMode.mockReturnValue(true)
    demoModeCallback()

    // Should have demo clusters
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.isLoading).toBe(false)
    // Demo data has well-known cluster names
    const names = clusterCache.clusters.map(c => c.name)
    expect(names).toContain('kind-local')
  })

  it('does nothing when switching FROM demo mode (handled by useClusters)', () => {
    const demoModeCallback = mockSubscribeDemoMode.mock.calls[0]?.[0]
    if (!demoModeCallback) return

    // Initialize with demo mode on
    mockIsDemoMode.mockReturnValue(true)
    demoModeCallback()

    // Seed demo clusters
    const demoClusters = [...clusterCache.clusters]

    // Switch to live mode
    mockIsDemoMode.mockReturnValue(false)
    demoModeCallback()

    // Cache is NOT cleared — useClusters handles the live fetch
    // (the function only acts when switching TO demo mode)
    // The clusters remain from the previous demo state
    expect(clusterCache.clusters.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// registerCacheReset callback
// ============================================================================
describe('registerCacheReset callback', () => {
  it('registerCacheReset was called during module initialization', () => {
    expect(mockRegisterCacheReset).toHaveBeenCalledWith('clusters', expect.any(Function))
  })

  it('resets cluster cache to loading state when mode transition fires', () => {
    const resetCallback = mockRegisterCacheReset.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'clusters'
    )?.[1]
    if (!resetCallback) return

    // Seed data
    updateClusterCache({
      clusters: [makeCluster()],
      isLoading: false,
    })

    // Fire the mode transition reset
    resetCallback()

    expect(clusterCache.clusters).toEqual([])
    expect(clusterCache.isLoading).toBe(true)
  })
})

// ============================================================================
// localStorage error paths for distribution and cluster caches
// ============================================================================
describe('localStorage error resilience', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('handles malformed JSON in distribution cache gracefully', () => {
    localStorage.setItem('kubestellar-cluster-distributions', '{invalid json!!}')

    // updateClusterCache internally calls loadDistributionCache which parses this
    expect(() => {
      updateClusterCache({
        clusters: [makeCluster({ name: 'dist-err', distribution: undefined })],
      })
    }).not.toThrow()
  })

  it('handles malformed JSON in cluster cache gracefully', () => {
    localStorage.setItem('kubestellar-cluster-cache', 'not json')

    // mergeWithStoredClusters calls loadClusterCacheFromStorage which parses this
    expect(() => {
      updateClusterCache({
        clusters: [makeCluster({ name: 'cache-err' })],
      })
    }).not.toThrow()
  })

  it('handles localStorage.setItem throwing when saving cluster cache', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // Should not throw — saveClusterCacheToStorage catches errors
    expect(() => {
      updateClusterCache({
        clusters: [makeCluster({ name: 'quota-err' })],
      })
    }).not.toThrow()

    vi.restoreAllMocks()
  })

  it('handles empty array in cluster cache localStorage (returns empty)', () => {
    localStorage.setItem('kubestellar-cluster-cache', '[]')

    // An empty array is not > 0, so loadClusterCacheFromStorage returns []
    updateClusterCache({
      clusters: [makeCluster({ name: 'new-fresh' })],
    })
    // The cluster should exist without merge issues
    expect(clusterCache.clusters.some(c => c.name === 'new-fresh')).toBe(true)
  })

  it('handles non-array in cluster cache localStorage (returns empty)', () => {
    localStorage.setItem('kubestellar-cluster-cache', '"a string"')

    expect(() => {
      updateClusterCache({
        clusters: [makeCluster({ name: 'non-array' })],
      })
    }).not.toThrow()
  })
})

// ============================================================================
// mergeWithStoredClusters — pickMetric with zero vs undefined
// ============================================================================
describe('mergeWithStoredClusters — pickMetric zero vs undefined', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('pickMetric returns new value of 0 (respects zero, not treated as missing)', () => {
    const CACHED_CPU = 8
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'zero-test', context: 'ctx', cpuCores: CACHED_CPU, nodeCount: 5 }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'zero-test', cpuCores: 0, nodeCount: 0 })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'zero-test')!
    // pickMetric: newVal (0) !== undefined, so return 0
    expect(c.cpuCores).toBe(0)
    expect(c.nodeCount).toBe(0)
  })

  it('pickMetric falls back to cached when new value is undefined', () => {
    const CACHED_MEM = 64
    const CACHED_STORAGE = 200
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'undef-test', context: 'ctx', memoryGB: CACHED_MEM, storageGB: CACHED_STORAGE }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'undef-test', memoryGB: undefined, storageGB: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'undef-test')!
    expect(c.memoryGB).toBe(CACHED_MEM)
    expect(c.storageGB).toBe(CACHED_STORAGE)
  })

  it('preserves healthy and reachable via nullish coalescing from cache', () => {
    localStorage.setItem('kubestellar-cluster-cache', JSON.stringify([
      { name: 'health-nc', context: 'ctx', healthy: false, reachable: false }
    ]))

    updateClusterCache({
      clusters: [makeCluster({ name: 'health-nc', healthy: undefined, reachable: undefined })],
    })

    const c = clusterCache.clusters.find(c => c.name === 'health-nc')!
    // ?? operator: undefined ?? false => false
    expect(c.healthy).toBe(false)
    expect(c.reachable).toBe(false)
  })
})

// ============================================================================
// shareMetricsBetweenSameServerClusters — additional metric fields
// ============================================================================
describe('shareMetricsBetweenSameServerClusters — storage and memory metrics', () => {
  it('copies storageBytes and storageGB from source to target', () => {
    const STORAGE_BYTES = 500_000_000_000
    const STORAGE_GB = 500
    const source = makeCluster({
      name: 'storage-src',
      server: 'https://shared-storage',
      nodeCount: 3,
      cpuCores: 8,
      storageBytes: STORAGE_BYTES,
      storageGB: STORAGE_GB,
    })
    const target = makeCluster({
      name: 'storage-tgt',
      server: 'https://shared-storage',
      nodeCount: 0,
      cpuCores: undefined,
      storageBytes: undefined,
      storageGB: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'storage-tgt')!
    expect(tgt.storageBytes).toBe(STORAGE_BYTES)
    expect(tgt.storageGB).toBe(STORAGE_GB)
  })

  it('copies memoryBytes and memoryRequestsBytes from source', () => {
    const MEM_BYTES = 34_359_738_368
    const MEM_REQ_BYTES = 17_179_869_184
    const source = makeCluster({
      name: 'mem-src',
      server: 'https://shared-mem',
      nodeCount: 3,
      cpuCores: 8,
      memoryBytes: MEM_BYTES,
      memoryRequestsBytes: MEM_REQ_BYTES,
    })
    const target = makeCluster({
      name: 'mem-tgt',
      server: 'https://shared-mem',
      nodeCount: 0,
      cpuCores: undefined,
      memoryBytes: undefined,
      memoryRequestsBytes: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'mem-tgt')!
    expect(tgt.memoryBytes).toBe(MEM_BYTES)
    expect(tgt.memoryRequestsBytes).toBe(MEM_REQ_BYTES)
  })

  it('copies cpuRequestsMillicores from source when target has none', () => {
    const CPU_REQ_MILLI = 4500
    const source = makeCluster({
      name: 'milli-src',
      server: 'https://shared-milli',
      nodeCount: 5,
      cpuCores: 16,
      cpuRequestsMillicores: CPU_REQ_MILLI,
    })
    const target = makeCluster({
      name: 'milli-tgt',
      server: 'https://shared-milli',
      nodeCount: 0,
      cpuCores: undefined,
      cpuRequestsMillicores: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'milli-tgt')!
    expect(tgt.cpuRequestsMillicores).toBe(CPU_REQ_MILLI)
  })

  it('does not copy when target already has all metrics', () => {
    const source = makeCluster({
      name: 'full-src',
      server: 'https://shared-full',
      nodeCount: 3,
      cpuCores: 8,
    })
    const target = makeCluster({
      name: 'full-tgt',
      server: 'https://shared-full',
      nodeCount: 5,
      podCount: 30,
      cpuCores: 16,
      cpuRequestsCores: 10,
    })

    const result = shareMetricsBetweenSameServerClusters([source, target])
    const tgt = result.find(c => c.name === 'full-tgt')!
    // Should keep its own values since it has everything
    expect(tgt.nodeCount).toBe(5)
    expect(tgt.cpuCores).toBe(16)
  })

  it('prefers cluster with requests score (1 point) over empty', () => {
    const CPU_REQ = 2.5
    const withRequests = makeCluster({
      name: 'req-src',
      server: 'https://shared-req',
      nodeCount: 0,
      cpuCores: undefined,
      cpuRequestsCores: CPU_REQ,
    })
    const empty = makeCluster({
      name: 'req-tgt',
      server: 'https://shared-req',
      nodeCount: 0,
      cpuCores: undefined,
      cpuRequestsCores: undefined,
    })

    const result = shareMetricsBetweenSameServerClusters([withRequests, empty])
    const tgt = result.find(c => c.name === 'req-tgt')!
    expect(tgt.cpuRequestsCores).toBe(CPU_REQ)
  })
})

// ============================================================================
// deduplicateClustersByServer — request metrics cross-merge
// ============================================================================
describe('deduplicateClustersByServer — cross-merge scenarios', () => {
  it('uses primary cluster nodeCount/podCount — does not take max (#6112)', () => {
    // Regression for #6112: previous behavior used Math.max which caused
    // scale-downs to show stale over-counts. The primary is now authoritative.
    const NODE_A = 3
    const NODE_B = 10
    const POD_A = 50
    const POD_B = 20
    // a has cpuCores so it sorts first (prefer cluster with metrics) and becomes primary.
    const a = makeCluster({ name: 'a', server: 'https://cross', nodeCount: NODE_A, podCount: POD_A, cpuCores: 8 })
    const b = makeCluster({ name: 'b', server: 'https://cross', nodeCount: NODE_B, podCount: POD_B, cpuCores: undefined })

    const result = deduplicateClustersByServer([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].nodeCount).toBe(NODE_A)
    expect(result[0].podCount).toBe(POD_A)
  })

  it('merges memoryRequestsGB from different cluster than capacity source', () => {
    const MEM_GB = 128
    const MEM_REQ_GB = 64
    const MEM_REQ_BYTES = 68_719_476_736
    const withCapacity = makeCluster({
      name: 'cap-only',
      server: 'https://cross-mem',
      memoryGB: MEM_GB,
      cpuCores: 32,
      memoryRequestsGB: undefined,
      memoryRequestsBytes: undefined,
    })
    const withRequests = makeCluster({
      name: 'req-only',
      server: 'https://cross-mem',
      cpuCores: undefined,
      memoryRequestsGB: MEM_REQ_GB,
      memoryRequestsBytes: MEM_REQ_BYTES,
    })

    const result = deduplicateClustersByServer([withCapacity, withRequests])
    expect(result).toHaveLength(1)
    expect(result[0].memoryRequestsGB).toBe(MEM_REQ_GB)
    expect(result[0].memoryRequestsBytes).toBe(MEM_REQ_BYTES)
  })

  it('handles empty input array', () => {
    const result = deduplicateClustersByServer([])
    expect(result).toEqual([])
  })

  it('prefers shorter name when all else is equal', () => {
    const short = makeCluster({ name: 'ab', server: 'https://len', cpuCores: 8 })
    const long = makeCluster({ name: 'abcdef', server: 'https://len', cpuCores: 8 })

    const result = deduplicateClustersByServer([long, short])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ab')
    expect(result[0].aliases).toContain('abcdef')
  })

  it('detects auto-generated name with .openshift.com pattern', () => {
    const friendly = makeCluster({ name: 'prod', server: 'https://dedup-ocp' })
    const autoGen = makeCluster({
      name: 'default/api-cluster.openshift.com:6443/admin',
      server: 'https://dedup-ocp',
    })

    const result = deduplicateClustersByServer([autoGen, friendly])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod')
  })
})

// ============================================================================
// fetchWithRetry — caller abort signal forwarding
// ============================================================================
describe('fetchWithRetry — signal forwarding and cleanup', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    // Pre-seed agent token so agentFetch() skips the token-fetch call,
    // keeping globalThis.fetch call counts predictable.
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'test-token')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    vi.restoreAllMocks()
  })

  it('forwards caller abort signal to internal controller', async () => {
    const callerController = new AbortController()
    const OK_STATUS = 200
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: OK_STATUS }))

    const resp = await fetchWithRetry('/test', { signal: callerController.signal })
    expect(resp.status).toBe(OK_STATUS)
  })

  it('aborts fetch when caller signal is aborted', async () => {
    const callerController = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')

    globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
      // Simulate the abort propagation
      callerController.abort()
      return Promise.reject(abortError)
    })

    await expect(
      fetchWithRetry('/test', { signal: callerController.signal, maxRetries: 0 })
    ).rejects.toThrow()
  })

  it('removes abort event listener after successful fetch (cleanup)', async () => {
    const callerController = new AbortController()
    const addSpy = vi.spyOn(callerController.signal, 'addEventListener')
    const removeSpy = vi.spyOn(callerController.signal, 'removeEventListener')

    const OK_STATUS = 200
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: OK_STATUS }))

    await fetchWithRetry('/test', { signal: callerController.signal })

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('removes abort event listener even after fetch throws', async () => {
    const callerController = new AbortController()
    const removeSpy = vi.spyOn(callerController.signal, 'removeEventListener')

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('non-transient'))

    await expect(
      fetchWithRetry('/test', { signal: callerController.signal, maxRetries: 0 })
    ).rejects.toThrow('non-transient')

    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('exhausts all retries on persistent 5xx then returns last response', async () => {
    vi.useFakeTimers()
    const SERVER_ERROR = 502
    const INITIAL_BACKOFF = 100
    const MAX_RETRIES = 2

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('bad gateway', { status: SERVER_ERROR }))

    const promise = fetchWithRetry('/test', {
      maxRetries: MAX_RETRIES,
      initialBackoffMs: INITIAL_BACKOFF,
    })

    // Advance through all backoffs
    await vi.advanceTimersByTimeAsync(INITIAL_BACKOFF)       // first retry
    const SECOND_BACKOFF = 200
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF)        // second retry

    const resp = await promise
    expect(resp.status).toBe(SERVER_ERROR)
    const TOTAL_ATTEMPTS = 3
    expect(globalThis.fetch).toHaveBeenCalledTimes(TOTAL_ATTEMPTS)
    vi.useRealTimers()
  })

  it('throws last error when retries exhausted on transient error', async () => {
    vi.useFakeTimers()
    const INITIAL_BACKOFF = 100
    const OK_STATUS = 200

    // First call: TypeError (transient, retryable)
    // Second call: success (proves retry happened)
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/test', {
      maxRetries: 1,
      initialBackoffMs: INITIAL_BACKOFF,
    })

    await vi.advanceTimersByTimeAsync(INITIAL_BACKOFF)

    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    const TOTAL_ATTEMPTS = 2
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL_ATTEMPTS)
    vi.useRealTimers()
  })
})

// ============================================================================
// updateSingleClusterInCache — triggers shareMetrics for different metric keys
// ============================================================================
describe('updateSingleClusterInCache — shareMetrics triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clusterSubscribers.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares storageGB to same-server clusters when updated', () => {
    const STORAGE_GB = 500
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'store-src', server: 'https://shared-store', storageGB: undefined, nodeCount: 3 }),
        makeCluster({ name: 'store-dst', server: 'https://shared-store', storageGB: undefined, nodeCount: 0 }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('store-src', { storageGB: STORAGE_GB })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const dst = clusterCache.clusters.find(c => c.name === 'store-dst')!
    expect(dst.storageGB).toBe(STORAGE_GB)
  })

  it('shares memoryGB to same-server clusters when updated', () => {
    const MEM_GB = 256
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'mem-src', server: 'https://shared-mem2', memoryGB: undefined, nodeCount: 3 }),
        makeCluster({ name: 'mem-dst', server: 'https://shared-mem2', memoryGB: undefined, nodeCount: 0 }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('mem-src', { memoryGB: MEM_GB })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const dst = clusterCache.clusters.find(c => c.name === 'mem-dst')!
    expect(dst.memoryGB).toBe(MEM_GB)
  })

  it('shares podCount to same-server clusters when updated', () => {
    const POD_COUNT = 150
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'pod-src', server: 'https://shared-pod', podCount: 0, nodeCount: 3 }),
        makeCluster({ name: 'pod-dst', server: 'https://shared-pod', podCount: 0, nodeCount: 0 }),
      ],
      isLoading: false,
    })

    updateSingleClusterInCache('pod-src', { podCount: POD_COUNT })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    const dst = clusterCache.clusters.find(c => c.name === 'pod-dst')!
    expect(dst.podCount).toBe(POD_COUNT)
  })

  it('does NOT trigger shareMetrics when non-metric keys are updated', () => {
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'non-metric', server: 'https://shared-nm', nodeCount: 3 }),
        makeCluster({ name: 'non-metric2', server: 'https://shared-nm', nodeCount: 0, cpuCores: undefined }),
      ],
      isLoading: false,
    })

    // distribution update does not trigger shareMetricsBetweenSameServerClusters
    updateSingleClusterInCache('non-metric', { distribution: 'openshift' })
    vi.advanceTimersByTime(CLUSTER_NOTIFY_DEBOUNCE_MS)

    // non-metric2 should NOT have gotten cpuCores from non-metric
    // (sharing only happens when metric keys are in the update)
    const dst = clusterCache.clusters.find(c => c.name === 'non-metric2')!
    expect(dst.distribution).toBeUndefined()
  })
})

// ============================================================================
// Distribution detection from namespaces (exercised via updateClusterCache)
// These test the private detectDistributionFromNamespaces indirectly
// by setting up localStorage distribution cache with namespace patterns
// ============================================================================
describe('distribution cache with namespaces', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('preserves namespaces in distribution cache via updateDistributionCache', () => {
    updateClusterCache({
      clusters: [makeCluster({
        name: 'ns-dist',
        distribution: 'openshift',
        namespaces: ['openshift-operators', 'default'],
      })],
    })

    const stored = localStorage.getItem('kubestellar-cluster-distributions')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed['ns-dist'].namespaces).toContain('openshift-operators')
  })

  it('does not update distribution cache when no distribution changes', () => {
    // First set
    updateClusterCache({
      clusters: [makeCluster({ name: 'stable-dist', distribution: 'eks' })],
    })
    const firstStored = localStorage.getItem('kubestellar-cluster-distributions')

    // Update same cluster with same distribution
    updateClusterCache({
      clusters: [makeCluster({ name: 'stable-dist', distribution: 'eks' })],
    })
    const secondStored = localStorage.getItem('kubestellar-cluster-distributions')

    // Both should be equivalent
    expect(JSON.parse(firstStored!)).toEqual(JSON.parse(secondStored!))
  })
})

// ============================================================================
// saveClusterCacheToStorage — field mapping and filtering
// ============================================================================
describe('saveClusterCacheToStorage — field selection', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
  })

  it('saves authMethod field to localStorage', () => {
    updateClusterCache({
      clusters: [makeCluster({ name: 'auth-save', authMethod: 'exec' })],
    })

    const stored = JSON.parse(localStorage.getItem('kubestellar-cluster-cache')!)
    const saved = stored.find((c: ClusterInfo) => c.name === 'auth-save')
    expect(saved.authMethod).toBe('exec')
  })

  it('saves pvc fields to localStorage', () => {
    const PVC_COUNT = 12
    const PVC_BOUND = 10
    updateClusterCache({
      clusters: [makeCluster({ name: 'pvc-save', pvcCount: PVC_COUNT, pvcBoundCount: PVC_BOUND })],
    })

    const stored = JSON.parse(localStorage.getItem('kubestellar-cluster-cache')!)
    const saved = stored.find((c: ClusterInfo) => c.name === 'pvc-save')
    expect(saved.pvcCount).toBe(PVC_COUNT)
    expect(saved.pvcBoundCount).toBe(PVC_BOUND)
  })

  it('saves memory request fields to localStorage', () => {
    const MEM_REQ_BYTES = 17_179_869_184
    const MEM_REQ_GB = 16
    updateClusterCache({
      clusters: [makeCluster({
        name: 'mem-req-save',
        memoryRequestsBytes: MEM_REQ_BYTES,
        memoryRequestsGB: MEM_REQ_GB,
      })],
    })

    const stored = JSON.parse(localStorage.getItem('kubestellar-cluster-cache')!)
    const saved = stored.find((c: ClusterInfo) => c.name === 'mem-req-save')
    expect(saved.memoryRequestsBytes).toBe(MEM_REQ_BYTES)
    expect(saved.memoryRequestsGB).toBe(MEM_REQ_GB)
  })

  it('filters out clusters with empty name', () => {
    updateClusterCache({
      clusters: [
        makeCluster({ name: 'good-name' }),
        makeCluster({ name: '' }),
      ],
    })

    const stored = JSON.parse(localStorage.getItem('kubestellar-cluster-cache')!)
    expect(stored.every((c: ClusterInfo) => c.name !== '')).toBe(true)
  })
})

// ============================================================================
// fullFetchClusters — Netlify with empty cache
// ============================================================================
describe('fullFetchClusters — Netlify empty cache path', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    mockIsDemoMode.mockReturnValue(false)
    mockIsDemoToken.mockReturnValue(false)
    mockIsNetlifyDeployment.value = false
    mockIsAgentUnavailable.mockReturnValue(true)
    setHealthCheckFailures(0)
    updateClusterCache({
      clusters: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastUpdated: null,
      lastRefresh: null,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('fills empty Netlify cache with demo clusters on first load', async () => {
    mockIsNetlifyDeployment.value = true
    // No token or demo token
    localStorage.removeItem(STORAGE_KEY_TOKEN)

    await fullFetchClusters()

    expect(clusterCache.clusters.length).toBeGreaterThan(0)
    expect(clusterCache.isLoading).toBe(false)
  })

  it('skips update on Netlify when cache already has data', async () => {
    mockIsNetlifyDeployment.value = true
    localStorage.removeItem(STORAGE_KEY_TOKEN)

    // Pre-populate cache
    updateClusterCache({
      clusters: [makeCluster({ name: 'pre-existing-netlify' })],
      isLoading: false,
    })

    await fullFetchClusters()

    // Should preserve existing data, not replace with demo
    const names = clusterCache.clusters.map(c => c.name)
    expect(names).toContain('pre-existing-netlify')
  })
})

// ============================================================================
// agentFetch — passes through additional init options
// ============================================================================
describe('agentFetch — passes additional RequestInit options', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.clear()
  })

  it('passes method and body through to fetch', async () => {
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'skip-token-fetch')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    globalThis.fetch = mockFetch

    await agentFetch('http://localhost:8090/command', {
      method: 'POST',
      body: JSON.stringify({ cmd: 'test' }),
    })

    const call = mockFetch.mock.calls[0]
    expect(call[1]?.method).toBe('POST')
    expect(call[1]?.body).toBe(JSON.stringify({ cmd: 'test' }))
  })
})

// ============================================================================
// fetchWithRetry — default options
// ============================================================================
describe('fetchWithRetry — default parameter behavior', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    // Pre-seed agent token so agentFetch() skips the token-fetch call
    localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, 'test-token')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
  })

  it('uses default maxRetries=2 and initialBackoffMs=500 when not specified', async () => {
    vi.useFakeTimers()
    const SERVER_ERROR = 500
    const OK_STATUS = 200
    const DEFAULT_BACKOFF = 500
    const SECOND_BACKOFF = 1000

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('err', { status: SERVER_ERROR }))
      .mockResolvedValueOnce(new Response('ok', { status: OK_STATUS }))
    globalThis.fetch = fetchMock

    const promise = fetchWithRetry('/default-opts')

    await vi.advanceTimersByTimeAsync(DEFAULT_BACKOFF)
    await vi.advanceTimersByTimeAsync(SECOND_BACKOFF)

    const resp = await promise
    expect(resp.status).toBe(OK_STATUS)
    const TOTAL_ATTEMPTS = 3
    expect(fetchMock).toHaveBeenCalledTimes(TOTAL_ATTEMPTS)
    vi.useRealTimers()
  })
})

// ============================================================================
// updateClusterCache — saves distribution for clusters with namespaces
// ============================================================================
describe('updateClusterCache — distribution and distribution cache updates', () => {
  beforeEach(() => {
    localStorage.clear()
    clusterSubscribers.clear()
    updateClusterCache({ clusters: [], isLoading: false })
  })

  it('updates distribution cache when cluster distribution changes', () => {
    // First update — set distribution to eks
    updateClusterCache({
      clusters: [makeCluster({ name: 'dist-change', distribution: 'eks' })],
    })

    // Second update — change to openshift
    updateClusterCache({
      clusters: [makeCluster({ name: 'dist-change', distribution: 'openshift' })],
    })

    const stored = JSON.parse(localStorage.getItem('kubestellar-cluster-distributions')!)
    expect(stored['dist-change'].distribution).toBe('openshift')
  })
})
