/**
 * Tests for hooks/mcp/workloadQueries.ts — pod-related hooks.
 *
 * Covers: useAllPods, usePodIssues, and usePodLogs hook behaviors.
 * Split from workloadQueries.test.ts (see kubestellar/console#22772).
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

