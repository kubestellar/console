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

describe('useCachedISO27001Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClusterCacheRef.clusters = []
    mockIsAgentUnavailable.mockReturnValue(false)
    mockUseCache.mockReturnValue(defaultCacheReturn())
  })

  it('fetcher produces img-4 warning for :latest images', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const latestPod = {
      metadata: { name: 'latest-pod', namespace: 'default' },
      spec: {
        containers: [{ image: 'nginx:latest', securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true } }],
        securityContext: { runAsNonRoot: true },
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [latestPod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const img4 = result.find((f: { checkId: string }) => f.checkId === 'img-4')
    expect(img4).toBeDefined()
    expect(img4.status).toBe('warning')
  })

  it('fetcher detects untagged images (no colon in image ref)', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const untaggedPod = {
      metadata: { name: 'untagged-pod', namespace: 'default' },
      spec: {
        containers: [{ image: 'nginx', securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true } }],
        securityContext: { runAsNonRoot: true },
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [untaggedPod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const img4 = result.find((f: { checkId: string }) => f.checkId === 'img-4')
    expect(img4.status).toBe('warning')
  })

  it('fetcher produces node-2 warning for hostNetwork pods', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const hostNetPod = {
      metadata: { name: 'host-net', namespace: 'default' },
      spec: {
        hostNetwork: true,
        containers: [{ image: 'nginx:1.0', securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true } }],
        securityContext: { runAsNonRoot: true },
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [hostNetPod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const node2 = result.find((f: { checkId: string }) => f.checkId === 'node-2')
    expect(node2).toBeDefined()
    expect(node2.status).toBe('warning')
  })

  it('fetcher produces pod-5 fail for hostPath volumes', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const hostPathPod = {
      metadata: { name: 'hp-pod', namespace: 'default' },
      spec: {
        volumes: [{ hostPath: { path: '/var/run' } }],
        containers: [{ image: 'nginx:1.0', securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true } }],
        securityContext: { runAsNonRoot: true },
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [hostPathPod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const pod5 = result.find((f: { checkId: string }) => f.checkId === 'pod-5')
    expect(pod5).toBeDefined()
    expect(pod5.status).toBe('fail')
    expect(pod5.severity).toBe('high')
  })

  // ── Network policy checks ─────────────────────────────────────────────

  it('fetcher produces net-1 pass when all namespaces have NetworkPolicies', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') {
        return kubectlResult({ items: [{ metadata: { namespace: 'default' } }, { metadata: { namespace: 'app' } }] })
      }
      if (args[1] === 'namespaces') {
        return kubectlResult({ items: [{ metadata: { name: 'default' } }, { metadata: { name: 'app' } }] })
      }
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const net1 = result.find((f: { checkId: string }) => f.checkId === 'net-1')
    expect(net1).toBeDefined()
    expect(net1.status).toBe('pass')
  })

})
