/* Split from workloadQueries.test.ts for focused test modules. */
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
