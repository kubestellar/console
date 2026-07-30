/**
 * Tests for hooks/mcp/sharedImpl.orchestration.ts
 *
 * Covers:
 * - fullFetchClusters: deduplication, Netlify path, agent path, backend fallback, error fallback
 * - refreshSingleCluster: success, transient failure, offline threshold
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClusterInfo } from '../types'

// ── Module mocks ─────────────────────────────────────────────────────────────

let mockIsNetlifyDeployment = false
let mockIsDemoMode = false
let mockIsDemoToken = false

vi.mock('../../../lib/demoMode', () => ({
  get isDemoMode() { return mockIsDemoMode },
  get isNetlifyDeployment() { return mockIsNetlifyDeployment },
  isDemoMode: () => mockIsDemoMode,
  isDemoToken: () => mockIsDemoToken,
}))

const mockUpdateClusterCache = vi.fn()
const mockUpdateSingleClusterInCache = vi.fn()
const mockNotifyClusterSubscribers = vi.fn()

let mockClusterCache: { clusters: ClusterInfo[]; consecutiveFailures: number } = {
  clusters: [],
  consecutiveFailures: 0,
}

vi.mock('../sharedImpl.state', () => ({
  get clusterCache() { return mockClusterCache },
  updateClusterCache: (...args: unknown[]) => mockUpdateClusterCache(...args),
  updateSingleClusterInCache: (...args: unknown[]) => mockUpdateSingleClusterInCache(...args),
  notifyClusterSubscribers: (...args: unknown[]) => mockNotifyClusterSubscribers(...args),
}))

const mockFetchClusterListFromAgent = vi.fn()
vi.mock('../sharedImpl.fetching', () => ({
  fetchClusterListFromAgent: (...args: unknown[]) => mockFetchClusterListFromAgent(...args),
}))

const mockCheckHealthProgressively = vi.fn()
const mockFetchSingleClusterHealth = vi.fn()
const mockClearClusterFailure = vi.fn()
const mockShouldMarkOffline = vi.fn(() => false)
const mockRecordClusterFailure = vi.fn()

vi.mock('../sharedImpl.health', () => ({
  checkHealthProgressively: (...args: unknown[]) => mockCheckHealthProgressively(...args),
  fetchSingleClusterHealth: (...args: unknown[]) => mockFetchSingleClusterHealth(...args),
  clearClusterFailure: (...args: unknown[]) => mockClearClusterFailure(...args),
  shouldMarkOffline: (...args: unknown[]) => mockShouldMarkOffline(...args),
  recordClusterFailure: (...args: unknown[]) => mockRecordClusterFailure(...args),
}))

const mockGetDemoClusters = vi.fn(() => [{ name: 'demo-cluster', isDemo: true } as ClusterInfo])
vi.mock('../sharedImpl.demo', () => ({
  getDemoClusters: () => mockGetDemoClusters(),
}))

const mockDeduplicateClustersByServer = vi.fn((clusters: ClusterInfo[]) => clusters)
vi.mock('../clusterUtils', () => ({
  deduplicateClustersByServer: (...args: unknown[]) => mockDeduplicateClustersByServer(...args as [ClusterInfo[]]),
}))

const mockGetLiveClustersForFallback = vi.fn((clusters: ClusterInfo[]) => clusters)
vi.mock('../sharedImpl.persistence', () => ({
  getLiveClustersForFallback: (...args: unknown[]) => mockGetLiveClustersForFallback(...args as [ClusterInfo[]]),
}))

vi.mock('../../../lib/cache', () => ({
  resetFailuresForCluster: vi.fn(),
}))

vi.mock('../../../lib/constants/storage', () => ({
  STORAGE_KEY_TOKEN: 'kc-token',
}))

vi.mock('../sharedImpl.constants', () => ({
  MIN_REFRESH_INDICATOR_MS: 0, // disable delay in tests
}))

const mockApiGet = vi.fn()
vi.mock('../../../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockIsNetlifyDeployment = false
  mockIsDemoMode = false
  mockIsDemoToken = false
  mockClusterCache = { clusters: [], consecutiveFailures: 0 }
  mockFetchClusterListFromAgent.mockResolvedValue(null)
  mockGetDemoClusters.mockReturnValue([{ name: 'demo-cluster', isDemo: true } as ClusterInfo])
  mockDeduplicateClustersByServer.mockImplementation((c: ClusterInfo[]) => c)
  mockGetLiveClustersForFallback.mockImplementation((c: ClusterInfo[]) => c)
  mockShouldMarkOffline.mockReturnValue(false)
  mockFetchSingleClusterHealth.mockResolvedValue(null)
  localStorage.clear()
})

// ── fullFetchClusters ─────────────────────────────────────────────────────────

describe('fullFetchClusters', () => {
  it('returns demo clusters on Netlify with demo token and empty cache', async () => {
    mockIsNetlifyDeployment = true
    localStorage.setItem('kc-token', 'demo-token')
    const { fullFetchClusters } = await import('../sharedImpl.orchestration')

    await fullFetchClusters()

    expect(mockUpdateClusterCache).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: expect.arrayContaining([expect.objectContaining({ name: 'demo-cluster' })]) })
    )
  })

  it('preserves existing cache on Netlify with demo token when cache non-empty', async () => {
    mockIsNetlifyDeployment = true
    localStorage.setItem('kc-token', 'demo-token')
    mockClusterCache = { clusters: [{ name: 'existing' } as ClusterInfo], consecutiveFailures: 0 }
    const { fullFetchClusters } = await import('../sharedImpl.orchestration')

    await fullFetchClusters()

    // updateClusterCache should NOT have been called with clusters array
    expect(mockUpdateClusterCache).not.toHaveBeenCalledWith(
      expect.objectContaining({ clusters: expect.anything() })
    )
  })

  it('proceeds past Netlify block when real token present', async () => {
    mockIsNetlifyDeployment = true
    localStorage.setItem('kc-token', 'real-bearer-token')
    const liveClusters = [{ name: 'prod', server: 'https://k8s.io' } as ClusterInfo]
    mockFetchClusterListFromAgent.mockResolvedValueOnce(liveClusters)
    const { fullFetchClusters } = await import('../sharedImpl.orchestration')

    await fullFetchClusters()

    expect(mockCheckHealthProgressively).toHaveBeenCalled()
  })

  it('merges agent clusters with existing cached health data', async () => {
    const existing: ClusterInfo[] = [{
      name: 'k8s-prod',
      context: 'k8s-prod',
      nodeCount: 5,
      podCount: 50,
      cpuCores: 32,
      memoryGB: 64,
      storageGB: 500,
      healthy: true,
      reachable: true,
      distribution: 'eks',
    }]
    mockClusterCache = { clusters: existing, consecutiveFailures: 0 }

    const agentNew: ClusterInfo[] = [{ name: 'k8s-prod', context: 'k8s-prod', server: 'https://new' } as ClusterInfo]
    mockFetchClusterListFromAgent.mockResolvedValueOnce(agentNew)
    localStorage.setItem('kc-token', 'real-token')

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    // Should have been called with clusters that preserve existing nodeCount
    const call = mockUpdateClusterCache.mock.calls.find(c => c[0]?.clusters)
    expect(call).toBeDefined()
    const mergedClusters = call![0].clusters as ClusterInfo[]
    const merged = mergedClusters.find(c => c.name === 'k8s-prod')
    expect(merged?.nodeCount).toBe(5)
    expect(merged?.distribution).toBe('eks')
  })

  it('uses demo clusters when agent returns null and demo mode + demo token', async () => {
    mockIsDemoMode = true
    mockIsDemoToken = true
    mockFetchClusterListFromAgent.mockResolvedValueOnce(null)
    localStorage.setItem('kc-token', 'demo-token')

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    const clusterCall = mockUpdateClusterCache.mock.calls.find(c => c[0]?.clusters)
    expect(clusterCall![0].clusters[0].name).toBe('demo-cluster')
  })

  it('returns loading=false and no clusters when agent unavailable and no token', async () => {
    mockFetchClusterListFromAgent.mockResolvedValueOnce(null)
    // no token in localStorage

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    const finalCall = mockUpdateClusterCache.mock.calls.at(-1)![0]
    expect(finalCall.isLoading).toBe(false)
    expect(finalCall.isRefreshing).toBe(false)
  })

  it('falls back to backend API when agent unavailable and has token', async () => {
    mockFetchClusterListFromAgent.mockResolvedValueOnce(null)
    localStorage.setItem('kc-token', 'real-token')
    const backendClusters = [{ name: 'backend-cluster' } as ClusterInfo]
    mockApiGet.mockResolvedValueOnce({ data: { clusters: backendClusters } })

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    expect(mockApiGet).toHaveBeenCalledWith('/api/mcp/clusters')
    expect(mockCheckHealthProgressively).toHaveBeenCalled()
  })

  it('uses fallback clusters on error', async () => {
    mockFetchClusterListFromAgent.mockRejectedValueOnce(new Error('network failure'))
    localStorage.setItem('kc-token', 'real-token')
    const fallback: ClusterInfo[] = [{ name: 'fallback' } as ClusterInfo]
    mockGetLiveClustersForFallback.mockReturnValueOnce(fallback)

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    const clusterCall = mockUpdateClusterCache.mock.calls.find(c => c[0]?.clusters)
    expect(clusterCall![0].clusters).toEqual(fallback)
  })

  it('increments consecutiveFailures on error', async () => {
    mockClusterCache = { clusters: [], consecutiveFailures: 2 }
    mockFetchClusterListFromAgent.mockRejectedValueOnce(new Error('fail'))
    localStorage.setItem('kc-token', 'real-token')

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    const clusterCall = mockUpdateClusterCache.mock.calls.find(c => c[0]?.consecutiveFailures !== undefined)
    expect(clusterCall![0].consecutiveFailures).toBe(3)
  })

  it('sets refreshing indicator when cache already has clusters', async () => {
    mockClusterCache = {
      clusters: [{ name: 'existing' } as ClusterInfo],
      consecutiveFailures: 0,
    }
    const newClusters: ClusterInfo[] = [{ name: 'existing' } as ClusterInfo]
    mockFetchClusterListFromAgent.mockResolvedValueOnce(newClusters)
    localStorage.setItem('kc-token', 'real-token')

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    // First updateClusterCache call should set isRefreshing:true
    expect(mockUpdateClusterCache.mock.calls[0][0]).toMatchObject({ isRefreshing: true })
  })

  it('deduplicates agent clusters before health check', async () => {
    const clusters: ClusterInfo[] = [
      { name: 'ctx1', server: 'https://same.k8s.io' } as ClusterInfo,
      { name: 'ctx2', server: 'https://same.k8s.io' } as ClusterInfo,
    ]
    mockFetchClusterListFromAgent.mockResolvedValueOnce(clusters)
    const deduped: ClusterInfo[] = [{ name: 'ctx1', server: 'https://same.k8s.io' } as ClusterInfo]
    mockDeduplicateClustersByServer.mockReturnValueOnce(deduped)
    localStorage.setItem('kc-token', 'real-token')

    const { fullFetchClusters } = await import('../sharedImpl.orchestration')
    await fullFetchClusters()

    expect(mockDeduplicateClustersByServer).toHaveBeenCalledWith(clusters)
    expect(mockCheckHealthProgressively).toHaveBeenCalledWith(deduped)
  })
})

// ── refreshSingleCluster ──────────────────────────────────────────────────────

describe('refreshSingleCluster', () => {
  it('updates cluster with health data on success', async () => {
    const clusterName = 'prod-cluster'
    mockClusterCache = {
      clusters: [{ name: clusterName, context: 'prod-ctx' } as ClusterInfo],
      consecutiveFailures: 0,
    }
    const health = {
      cluster: clusterName,
      healthy: true,
      reachable: true,
      nodeCount: 3,
      podCount: 30,
      cpuCores: 24,
      memoryGB: 96,
      storageGB: 500,
    }
    mockFetchSingleClusterHealth.mockResolvedValueOnce(health)

    const { refreshSingleCluster } = await import('../sharedImpl.orchestration')
    await refreshSingleCluster(clusterName)

    expect(mockClearClusterFailure).toHaveBeenCalledWith(clusterName)
    expect(mockUpdateSingleClusterInCache).toHaveBeenCalledWith(
      clusterName,
      expect.objectContaining({
        healthy: true,
        reachable: true,
        nodeCount: 3,
        refreshing: false,
      })
    )
  })

  it('marks cluster as refreshing immediately before fetch', async () => {
    const clusterName = 'slow-cluster'
    mockClusterCache = {
      clusters: [{ name: clusterName, context: 'slow-ctx' } as ClusterInfo],
      consecutiveFailures: 0,
    }
    // Health returns null (simulates timeout)
    mockFetchSingleClusterHealth.mockResolvedValueOnce(null)

    const { refreshSingleCluster } = await import('../sharedImpl.orchestration')
    await refreshSingleCluster(clusterName)

    // notifyClusterSubscribers called for immediate "refreshing" feedback
    expect(mockNotifyClusterSubscribers).toHaveBeenCalled()
  })

  it('keeps previous data on transient failure (shouldMarkOffline=false)', async () => {
    const clusterName = 'flaky-cluster'
    mockClusterCache = {
      clusters: [{ name: clusterName, context: 'flaky' } as ClusterInfo],
      consecutiveFailures: 0,
    }
    mockFetchSingleClusterHealth.mockResolvedValueOnce(null)
    mockShouldMarkOffline.mockReturnValueOnce(false)

    const { refreshSingleCluster } = await import('../sharedImpl.orchestration')
    await refreshSingleCluster(clusterName)

    expect(mockRecordClusterFailure).toHaveBeenCalledWith(clusterName)
    expect(mockUpdateSingleClusterInCache).toHaveBeenCalledWith(
      clusterName,
      expect.objectContaining({ refreshing: false })
    )
    // Should NOT mark as reachable: false on transient failure
    const call = mockUpdateSingleClusterInCache.mock.calls.at(-1)![1]
    expect(call.reachable).toBeUndefined()
  })

  it('marks cluster unreachable after offline threshold exceeded', async () => {
    const clusterName = 'long-offline'
    mockClusterCache = {
      clusters: [{ name: clusterName, context: 'long-offline' } as ClusterInfo],
      consecutiveFailures: 0,
    }
    mockFetchSingleClusterHealth.mockResolvedValueOnce(null)
    mockShouldMarkOffline.mockReturnValueOnce(true)

    const { refreshSingleCluster } = await import('../sharedImpl.orchestration')
    await refreshSingleCluster(clusterName)

    expect(mockUpdateSingleClusterInCache).toHaveBeenCalledWith(
      clusterName,
      expect.objectContaining({
        healthy: false,
        reachable: false,
        errorType: 'timeout',
        refreshing: false,
      })
    )
  })

  it('handles unreachable health response from backend', async () => {
    const clusterName = 'unreachable-cluster'
    mockClusterCache = {
      clusters: [{ name: clusterName, context: clusterName } as ClusterInfo],
      consecutiveFailures: 0,
    }
    const health = {
      cluster: clusterName,
      healthy: false,
      reachable: false,
      nodeCount: 0,
      podCount: 0,
    }
    mockFetchSingleClusterHealth.mockResolvedValueOnce(health)

    const { refreshSingleCluster } = await import('../sharedImpl.orchestration')
    await refreshSingleCluster(clusterName)

    const call = mockUpdateSingleClusterInCache.mock.calls.at(-1)![1]
    expect(call.reachable).toBe(false)
    expect(call.healthy).toBe(false)
    expect(call.refreshing).toBe(false)
  })
})
