/* Split from useCachedISO27001.test.ts for focused test modules. */
/**
 * Deep branch-coverage tests for useCachedISO27001.ts
 *
 * Tests the internal helper functions (getAgentClusters,
 * runISO27001ChecksForCluster, fetchISO27001AuditViaKubectl)
 * and the exported useCachedISO27001Audit hook by mocking
 * the underlying cache layer, kubectlProxy, and agent state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------


const {
  mockUseCache,
  mockKubectlProxy,
  mockClusterCacheRef,
  mockIsAgentUnavailable,
  mockSettledWithConcurrency,
} = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockKubectlProxy: { exec: vi.fn() },
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
  mockIsAgentUnavailable: vi.fn(() => false),
  mockSettledWithConcurrency: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/kubectlProxy', () => ({
    createCachedHook: vi.fn(),
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, KUBECTL_EXTENDED_TIMEOUT_MS: 60_000 }
})

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../useLocalAgent', () => ({
    createCachedHook: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../lib/utils/concurrency', () => ({
    createCachedHook: vi.fn(),
  settledWithConcurrency: async (...args: unknown[]) => {
    const result = await mockSettledWithConcurrency(...args)
    const onSettled = args[2] as ((r: PromiseSettledResult<unknown>, i: number) => void) | undefined
    if (onSettled && Array.isArray(result)) {
      result.forEach((r: PromiseSettledResult<unknown>, i: number) => onSettled(r, i))
    }
    return result
  },
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are in place
// ---------------------------------------------------------------------------

import { useCachedISO27001Audit } from '../useCachedISO27001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default mock return for useCache */
function defaultCacheReturn() {
  return {
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
  }
}

/** Create a kubectl exec result */
function kubectlResult(output: unknown, exitCode = 0) {
  return { output: JSON.stringify(output), exitCode }
}

/** Create a failed kubectl exec result */
function kubectlError(msg = 'error') {
  return { output: msg, exitCode: 1 }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

  beforeEach(() => {
    vi.clearAllMocks()
    mockClusterCacheRef.clusters = []
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue(defaultCacheReturn())
  })

  // ── Hook return shape ─────────────────────────────────────────────────

  it('fetcher produces pod-3 warning for 1-3 pods missing runAsNonRoot', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const podMissingRunAs = {
      metadata: { name: 'p1', namespace: 'default' },
      spec: {
        containers: [{ image: 'nginx:1.0', securityContext: { readOnlyRootFilesystem: true } }],
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [podMissingRunAs] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const pod3 = result.find((f: { checkId: string }) => f.checkId === 'pod-3')
    expect(pod3.status).toBe('warning')
  })

  it('fetcher skips system namespace pods (kube-*, local-path-storage)', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const systemPod = {
      metadata: { name: 'sys-pod', namespace: 'kube-system' },
      spec: {
        containers: [{ image: 'k8s:latest', securityContext: { privileged: true } }],
      },
    }
    const storagePod = {
      metadata: { name: 'storage-pod', namespace: 'local-path-storage' },
      spec: {
        containers: [{ image: 'rancher:latest', securityContext: { privileged: true } }],
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [systemPod, storagePod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const pod2 = result.find((f: { checkId: string }) => f.checkId === 'pod-2')
    expect(pod2.status).toBe('pass')
  })

  // ── Cluster-specific filter ───────────────────────────────────────────

  