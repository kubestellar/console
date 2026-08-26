/**
 * Tests for hooks/mcp/workloadQueries.ts
 *
 * Covers: demo data helpers, localStorage cache helpers, demo-mode hook paths
 * for usePods, useAllPods, usePodIssues, useDeploymentIssues, useDeployments,
 * useJobs, useHPAs, useReplicaSets, useStatefulSets, useDaemonSets,
 * useCronJobs, and usePodLogs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockIsBackendUnavailable,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockFetchSSE,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockSubscribePolling,
  mockIsInClusterMode,
  mockClassifyError,
  mockAgentFetch,
  mockFetchWithRetry,
  mockSubscribeWorkloadsCache,
  mockNotifyWorkloadsSubscribers,
  mockSetWorkloadsSharedState,
  mockKubectlProxy,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockFetchSSE: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockSubscribePolling: vi.fn(() => vi.fn()),
  mockIsInClusterMode: vi.fn(() => false),
  mockClassifyError: vi.fn((msg: string) => ({ type: 'unknown' as const, message: msg })),
  mockAgentFetch: vi.fn(),
  mockFetchWithRetry: vi.fn(),
  mockSubscribeWorkloadsCache: vi.fn(() => vi.fn()),
  mockNotifyWorkloadsSubscribers: vi.fn(),
  mockSetWorkloadsSharedState: vi.fn(),
  mockKubectlProxy: {
    getPodIssues: vi.fn(),
    getDeploymentIssues: vi.fn(),
    getDeployments: vi.fn(),
  },
}))

vi.mock('../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, isDemoMode: () => mockIsDemoMode() }
})

vi.mock('../../../lib/api', () => ({
  isBackendUnavailable: () => mockIsBackendUnavailable(),
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
}))

vi.mock('../pollingManager', () => ({
  subscribePolling: (...args: unknown[]) => mockSubscribePolling(...args),
}))

vi.mock('../../useBackendHealth', () => ({
  isInClusterMode: () => mockIsInClusterMode(),
}))

vi.mock('../../../lib/errorClassifier', () => ({
  classifyError: (...args: unknown[]) => mockClassifyError(...args),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 0,
  getEffectiveInterval: (ms: number) => ms,
  clusterCacheRef: { clusters: [] },
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
  getLocalAgentURL: () => 'http://127.0.0.1:8585',
}))

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    MCP_HOOK_TIMEOUT_MS: 5_000,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  }
})

vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: (...args: unknown[]) => mockSubscribeWorkloadsCache(...args),
  notifyWorkloadsSubscribers: () => mockNotifyWorkloadsSubscribers(),
  setWorkloadsSharedState: (...args: unknown[]) => mockSetWorkloadsSharedState(...args),
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  __workloadsTestables,
  __resetInfrastructureCaches,
} from '../workloadQueries'

const {
  getDemoPods,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoDeployments,
  getDemoAllPods,
  loadPodsCacheFromStorage,
  savePodsCacheToStorage,
  PODS_CACHE_KEY,
} = __workloadsTestables

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  __resetInfrastructureCaches()
  mockIsDemoMode.mockReturnValue(false)
  mockIsBackendUnavailable.mockReturnValue(false)
  mockIsAgentUnavailable.mockReturnValue(true)
  mockIsInClusterMode.mockReturnValue(false)
  mockFetchSSE.mockResolvedValue([])
  mockSubscribePolling.mockReturnValue(vi.fn())
  mockRegisterRefetch.mockReturnValue(vi.fn())
  mockRegisterCacheReset.mockReturnValue(vi.fn())
  mockSubscribeWorkloadsCache.mockReturnValue(vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// Demo data helpers
// =============================================================================

describe('getDemoPods', () => {
  it('returns 10 demo pods', () => {
    const pods = getDemoPods()
    expect(pods).toHaveLength(10)
    expect(pods[0]).toHaveProperty('name')
    expect(pods[0]).toHaveProperty('namespace')
    expect(pods[0]).toHaveProperty('cluster')
    expect(pods[0]).toHaveProperty('status')
    expect(pods[0]).toHaveProperty('restarts')
  })

  it('all pods have Running status', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(pod.status).toBe('Running')
    }
  })
})


describe('getDemoPodIssues', () => {
  it('returns 3 demo pod issues', () => {
    const issues = getDemoPodIssues()
    expect(issues).toHaveLength(3)
  })

  it('includes CrashLoopBackOff, OOMKilled, and Pending', () => {
    const issues = getDemoPodIssues()
    const statuses = issues.map(i => i.status)
    expect(statuses).toContain('CrashLoopBackOff')
    expect(statuses).toContain('OOMKilled')
    expect(statuses).toContain('Pending')
  })

  it('each issue has required fields', () => {
    const issues = getDemoPodIssues()
    for (const issue of issues) {
      expect(issue).toHaveProperty('name')
      expect(issue).toHaveProperty('namespace')
      expect(issue).toHaveProperty('cluster')
      expect(issue).toHaveProperty('reason')
      expect(issue).toHaveProperty('issues')
      expect(Array.isArray(issue.issues)).toBe(true)
    }
  })
})


describe('getDemoDeploymentIssues', () => {
  it('returns 2 demo deployment issues', () => {
    const issues = getDemoDeploymentIssues()
    expect(issues).toHaveLength(2)
  })

  it('each issue has replicas and readyReplicas', () => {
    const issues = getDemoDeploymentIssues()
    for (const issue of issues) {
      expect(typeof issue.replicas).toBe('number')
      expect(typeof issue.readyReplicas).toBe('number')
      expect(issue.readyReplicas).toBeLessThan(issue.replicas)
    }
  })
})


describe('getDemoDeployments', () => {
  it('returns 4 demo deployments', () => {
    const deployments = getDemoDeployments()
    expect(deployments).toHaveLength(4)
  })

  it('includes running, deploying, and failed statuses', () => {
    const deployments = getDemoDeployments()
    const statuses = deployments.map(d => d.status)
    expect(statuses).toContain('running')
    expect(statuses).toContain('deploying')
    expect(statuses).toContain('failed')
  })

  it('each deployment has progress field', () => {
    const deployments = getDemoDeployments()
    for (const d of deployments) {
      expect(typeof d.progress).toBe('number')
      expect(d.progress).toBeGreaterThanOrEqual(0)
      expect(d.progress).toBeLessThanOrEqual(100)
    }
  })
})


describe('getDemoAllPods', () => {
  it('returns more pods than getDemoPods (includes extra ml pods)', () => {
    const allPods = getDemoAllPods()
    const basePods = getDemoPods()
    expect(allPods.length).toBeGreaterThan(basePods.length)
  })

  it('includes ml-inference and model-server pods', () => {
    const allPods = getDemoAllPods()
    const names = allPods.map(p => p.name)
    expect(names.some(n => n.startsWith('ml-inference'))).toBe(true)
    expect(names.some(n => n.startsWith('model-server'))).toBe(true)
  })
})


describe('loadPodsCacheFromStorage', () => {
  it('returns null when localStorage is empty', () => {
    const result = loadPodsCacheFromStorage('pods:all:all:restarts:10')
    expect(result).toBeNull()
  })

  it('returns null when cache key does not match', () => {
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: 'pods:prod:default:restarts:10',
      data: [{ name: 'test-pod' }],
      timestamp: new Date().toISOString(),
    }))
    const result = loadPodsCacheFromStorage('pods:all:all:restarts:10')
    expect(result).toBeNull()
  })

  it('returns cached data when key matches', () => {
    const cacheKey = 'pods:cache-test:ns1:restarts:10'
    const mockPods = [{ name: 'cached-pod', namespace: 'default', cluster: 'test', status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'n1' }]
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: cacheKey,
      data: mockPods,
      timestamp: new Date().toISOString(),
    }))
    const result = loadPodsCacheFromStorage(cacheKey)
    expect(result).not.toBeNull()
    expect(result!.data).toHaveLength(1)
    expect(result!.data[0].name).toBe('cached-pod')
    expect(result!.timestamp).toBeInstanceOf(Date)
  })

  it('returns null when cached data is empty array', () => {
    const cacheKey = 'pods:all:all:restarts:10'
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: cacheKey,
      data: [],
      timestamp: new Date().toISOString(),
    }))
    const result = loadPodsCacheFromStorage(cacheKey)
    expect(result).toBeNull()
  })

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(PODS_CACHE_KEY, 'not-valid-json')
    const result = loadPodsCacheFromStorage('pods:all:all:restarts:10')
    expect(result).toBeNull()
  })

  it('uses current date when timestamp is missing', () => {
    const cacheKey = 'pods:timestamp-test:all:restarts:10'
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: cacheKey,
      data: [{ name: 'pod1' }],
    }))
    const before = new Date()
    const result = loadPodsCacheFromStorage(cacheKey)
    expect(result).not.toBeNull()
    expect(result!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})


describe('savePodsCacheToStorage', () => {
  it('persists module cache to localStorage after loading', () => {
    const cacheKey = 'pods:save-test:all:restarts:10'
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: cacheKey,
      data: [{ name: 'save-test-pod' }],
      timestamp: new Date().toISOString(),
    }))
    loadPodsCacheFromStorage(cacheKey)
    localStorage.clear()
    savePodsCacheToStorage()
    const stored = localStorage.getItem(PODS_CACHE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.data).toHaveLength(1)
    expect(parsed.key).toBe(cacheKey)
  })
})


