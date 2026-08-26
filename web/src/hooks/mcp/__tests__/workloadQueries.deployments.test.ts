/**
 * Tests for hooks/mcp/workloadQueries.ts — deployment scenarios.
 *
 * Covers: demo data helpers and hook behaviors for useDeployments and
 * useDeploymentIssues.
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


