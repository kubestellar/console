/**
 * Tests for hooks/mcp/workloadQueries.ts
 *
 * Covers: demo data helpers, localStorage cache helpers, demo-mode hook paths
 * for usePods, useAllPods, usePodIssues, useDeploymentIssues, useDeployments,
 * useJobs, useHPAs, useReplicaSets, useStatefulSets, useDaemonSets,
 * useCronJobs, and usePodLogs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

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
  LOCAL_AGENT_URL: 'http://127.0.0.1:8585',
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
}))

vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: (...args: unknown[]) => mockSubscribeWorkloadsCache(...args),
  notifyWorkloadsSubscribers: () => mockNotifyWorkloadsSubscribers(),
  setWorkloadsSharedState: (...args: unknown[]) => mockSetWorkloadsSharedState(...args),
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  usePods,
  useAllPods,
  usePodIssues,
  useDeploymentIssues,
  useDeployments,
  useJobs,
  useHPAs,
  useReplicaSets,
  useStatefulSets,
  useDaemonSets,
  useCronJobs,
  usePodLogs,
  __workloadsTestables,
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

// =============================================================================
// localStorage cache helpers
// =============================================================================

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

// =============================================================================
// usePods — demo mode
// =============================================================================

describe('usePods — demo mode', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
  })

  it('returns demo pods in demo mode', async () => {
    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.pods.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters demo pods by cluster', async () => {
    const { result } = renderHook(() => usePods('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const pod of result.current.pods) {
      expect(pod.cluster).toBe('prod-east')
    }
  })

  it('filters demo pods by namespace', async () => {
    const { result } = renderHook(() => usePods(undefined, 'production'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const pod of result.current.pods) {
      expect(pod.namespace).toBe('production')
    }
  })

  it('sorts demo pods by restarts (default)', async () => {
    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', 100))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    const restarts = result.current.pods.map(p => p.restarts)
    for (let i = 1; i < restarts.length; i++) {
      expect(restarts[i]).toBeLessThanOrEqual(restarts[i - 1])
    }
  })

  it('sorts demo pods by name', async () => {
    const { result } = renderHook(() => usePods(undefined, undefined, 'name', 100))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    const names = result.current.pods.map(p => p.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('respects limit parameter', async () => {
    const LIMIT = 3
    const { result } = renderHook(() => usePods(undefined, undefined, 'restarts', LIMIT))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.pods.length).toBeLessThanOrEqual(LIMIT)
  })

  it('sets lastUpdated in demo mode', async () => {
    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.lastUpdated).not.toBeNull()
    })
  })

  it('isFailed is false in demo mode', async () => {
    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

// =============================================================================
// usePods — backend unavailable
// =============================================================================

describe('usePods — backend unavailable', () => {
  it('returns empty pods when backend is unavailable', async () => {
    mockIsBackendUnavailable.mockReturnValue(true)
    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.lastUpdated).not.toBeNull()
  })
})

// =============================================================================
// usePods — SSE fetch
// =============================================================================

describe('usePods — SSE fetch', () => {
  it('calls fetchSSE and sets pods on success', async () => {
    const mockPods = [
      { name: 'p1', namespace: 'ns1', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 5, age: '1d', node: 'n1' },
      { name: 'p2', namespace: 'ns2', cluster: 'c2', status: 'Running', ready: '1/1', restarts: 2, age: '2d', node: 'n2' },
    ]
    mockFetchSSE.mockResolvedValue(mockPods)

    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.pods).toHaveLength(2)
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('handles SSE fetch failure', async () => {
    mockFetchSSE.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => usePods())
    await waitFor(() => {
      expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
    })
  })

  it('ignores AbortError', async () => {
    mockFetchSSE.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { result } = renderHook(() => usePods())
    // AbortError should not increment failures
    await waitFor(() => {
      expect(mockFetchSSE).toHaveBeenCalled()
    })
    expect(result.current.consecutiveFailures).toBe(0)
  })
})

// =============================================================================
// useAllPods — demo mode
// =============================================================================

describe('useAllPods — demo mode', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
  })

  it('returns all demo pods in demo mode', async () => {
    const { result } = renderHook(() => useAllPods())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.pods.length).toBe(getDemoAllPods().length)
    expect(result.current.error).toBeNull()
    expect(result.current.clusterErrors).toHaveLength(0)
  })

  it('filters by cluster in demo mode', async () => {
    const { result } = renderHook(() => useAllPods('vllm-d'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const pod of result.current.pods) {
      expect(pod.cluster).toBe('vllm-d')
    }
  })

  it('forceLive=true skips demo mode', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useAllPods(undefined, undefined, true))
    await waitFor(() => {
      expect(mockFetchSSE).toHaveBeenCalled()
    })
    expect(result.current.pods).toHaveLength(0)
  })
})

// =============================================================================
// usePodIssues — demo mode
// =============================================================================

describe('usePodIssues — demo mode', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
  })

  it('returns demo pod issues in demo mode', async () => {
    const { result } = renderHook(() => usePodIssues())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.issues.length).toBe(getDemoPodIssues().length)
    expect(result.current.error).toBeNull()
  })

  it('filters demo issues by cluster', async () => {
    const { result } = renderHook(() => usePodIssues('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const issue of result.current.issues) {
      expect(issue.cluster).toBe('prod-east')
    }
  })

  it('sets lastRefresh in demo mode', async () => {
    const { result } = renderHook(() => usePodIssues())
    await waitFor(() => {
      expect(result.current.lastRefresh).not.toBeNull()
    })
  })
})

// =============================================================================
// useDeploymentIssues — demo mode
// =============================================================================

describe('useDeploymentIssues — demo mode', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
  })

  it('returns demo deployment issues in demo mode', async () => {
    const { result } = renderHook(() => useDeploymentIssues())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.issues.length).toBe(getDemoDeploymentIssues().length)
    expect(result.current.error).toBeNull()
  })

  it('filters demo deployment issues by cluster', async () => {
    const { result } = renderHook(() => useDeploymentIssues('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const issue of result.current.issues) {
      expect(issue.cluster).toBe('prod-east')
    }
  })
})

// =============================================================================
// useDeployments — demo mode
// =============================================================================

describe('useDeployments — demo mode', () => {
  beforeEach(() => {
    mockIsDemoMode.mockReturnValue(true)
  })

  it('returns demo deployments in demo mode', async () => {
    const { result } = renderHook(() => useDeployments())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.deployments.length).toBe(getDemoDeployments().length)
    expect(result.current.error).toBeNull()
  })

  it('filters demo deployments by cluster', async () => {
    const { result } = renderHook(() => useDeployments('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    for (const d of result.current.deployments) {
      expect(d.cluster).toBe('prod-east')
    }
  })
})

// =============================================================================
// useJobs — SSE path (no demo mode for jobs)
// =============================================================================

describe('useJobs', () => {
  it('calls fetchSSE when agent is unavailable', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useJobs())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(mockFetchSSE).toHaveBeenCalled()
    expect(result.current.jobs).toHaveLength(0)
  })

  it('handles SSE error for jobs', async () => {
    mockFetchSSE.mockRejectedValue(new Error('SSE failed'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('SSE failed')
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('uses agent fetch when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ jobs: [{ name: 'job-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useJobs('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.jobs).toHaveLength(1)
    expect(mockReportAgentDataSuccess).toHaveBeenCalled()
  })
})

// =============================================================================
// useHPAs
// =============================================================================

describe('useHPAs', () => {
  it('calls agentFetch fallback when agent is unavailable', async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ hpas: [] }) })
    const { result } = renderHook(() => useHPAs())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.hpas).toHaveLength(0)
  })

  it('uses fetchWithRetry when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ hpas: [{ name: 'hpa-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useHPAs('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.hpas).toHaveLength(1)
  })
})

// =============================================================================
// useReplicaSets
// =============================================================================

describe('useReplicaSets', () => {
  it('returns empty array on agentFetch failure', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useReplicaSets())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.replicaSets).toHaveLength(0)
    expect(result.current.error).toBe('Network error')
  })

  it('uses agent when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ replicasets: [{ name: 'rs-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useReplicaSets('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.replicaSets).toHaveLength(1)
  })
})

// =============================================================================
// useStatefulSets
// =============================================================================

describe('useStatefulSets', () => {
  it('returns empty array initially with SSE', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useStatefulSets())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.statefulSets).toHaveLength(0)
  })

  it('uses agent when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ statefulsets: [{ name: 'ss-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useStatefulSets('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.statefulSets).toHaveLength(1)
  })
})

// =============================================================================
// useDaemonSets
// =============================================================================

describe('useDaemonSets', () => {
  it('returns empty array with SSE', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useDaemonSets())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.daemonSets).toHaveLength(0)
  })

  it('uses agent when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ daemonsets: [{ name: 'ds-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useDaemonSets('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.daemonSets).toHaveLength(1)
  })
})

// =============================================================================
// useCronJobs
// =============================================================================

describe('useCronJobs', () => {
  it('returns empty array with SSE', async () => {
    mockFetchSSE.mockResolvedValue([])
    const { result } = renderHook(() => useCronJobs())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.cronJobs).toHaveLength(0)
  })

  it('uses agent when cluster provided and agent available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const mockResponse = { ok: true, json: () => Promise.resolve({ cronjobs: [{ name: 'cj-1' }] }) }
    mockFetchWithRetry.mockResolvedValue(mockResponse)
    const { result } = renderHook(() => useCronJobs('prod-east'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.cronJobs).toHaveLength(1)
  })
})

// =============================================================================
// usePodLogs
// =============================================================================

describe('usePodLogs', () => {
  it('fetches logs via agentFetch', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ logs: 'line1\nline2\nline3' }),
    })
    const { result } = renderHook(() => usePodLogs('prod-east', 'default', 'my-pod'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.logs).toBe('line1\nline2\nline3')
    expect(result.current.error).toBeNull()
  })

  it('handles fetch error', async () => {
    mockAgentFetch.mockRejectedValue(new Error('Connection refused'))
    const { result } = renderHook(() => usePodLogs('prod-east', 'default', 'my-pod'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.logs).toBe('')
    expect(result.current.error).toBe('Connection refused')
  })

  it('clears logs when pod is empty', async () => {
    const { result } = renderHook(() => usePodLogs('prod-east', 'default', ''))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.logs).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('handles non-OK response', async () => {
    mockAgentFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })
    const { result } = renderHook(() => usePodLogs('prod-east', 'default', 'my-pod'))
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toContain('HTTP 500')
    expect(result.current.logs).toBe('')
  })

  it('passes container and tail params', async () => {
    const TAIL_LINES = 50
    mockAgentFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ logs: 'log output' }),
    })
    renderHook(() => usePodLogs('prod-east', 'default', 'my-pod', 'sidecar', TAIL_LINES))
    await waitFor(() => {
      expect(mockAgentFetch).toHaveBeenCalled()
    })
    const callUrl = mockAgentFetch.mock.calls[0][0] as string
    expect(callUrl).toContain('container=sidecar')
    expect(callUrl).toContain(`tail=${TAIL_LINES}`)
  })
})
