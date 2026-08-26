/**
 * Tests for hooks/mcp/workloadQueries.ts
 *
 * Covers: demo data helpers, localStorage cache helpers, demo-mode hook paths
 * for usePods, useAllPods, usePodIssues, useDeploymentIssues, useDeployments,
 * useJobs, useHPAs, useReplicaSets, useStatefulSets, useDaemonSets,
 * useCronJobs, and usePodLogs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

