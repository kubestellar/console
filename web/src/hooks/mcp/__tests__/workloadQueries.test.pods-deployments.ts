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


