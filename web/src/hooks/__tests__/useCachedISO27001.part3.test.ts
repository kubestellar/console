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
  it('fetcher produces net-1 fail when namespaces are missing NetworkPolicies', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlResult({ items: [] })
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
    expect(net1.status).toBe('fail')
    expect(net1.details).toContain('2 namespace(s) missing')
  })

  it('fetcher skips kube-* namespaces from network policy coverage check', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlResult({ items: [] })
      if (args[1] === 'namespaces') {
        return kubectlResult({
          items: [
            { metadata: { name: 'kube-system' } },
            { metadata: { name: 'kube-public' } },
          ],
        })
      }
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const net1 = result.find((f: { checkId: string }) => f.checkId === 'net-1')
    expect(net1.status).toBe('pass')
  })

  // ── Secrets in ConfigMaps check ───────────────────────────────────────

  it('fetcher produces sec-2 warning when ConfigMap contains suspicious data', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') {
        return kubectlResult({
          items: [{
            data: { config: 'password=supersecretvaluethatisverylong123' },
          }],
        })
      }
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const sec2 = result.find((f: { checkId: string }) => f.checkId === 'sec-2')
    expect(sec2).toBeDefined()
    expect(sec2.status).toBe('warning')
  })

  it('fetcher produces sec-2 pass when ConfigMap values are clean', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') {
        return kubectlResult({
          items: [{ data: { config: 'log_level=debug' } }],
        })
      }
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const sec2 = result.find((f: { checkId: string }) => f.checkId === 'sec-2')
    expect(sec2).toBeDefined()
    expect(sec2.status).toBe('pass')
  })

  // ── Pod Security: runAsNonRoot & readOnlyRootFilesystem ───────────────

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

  it('fetcher filters tasks to only the named cluster when cluster arg is set', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'c1', reachable: true },
      { name: 'c2', reachable: true },
    ]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit('c2'))
    const config = mockUseCache.mock.calls[0][0]

    try { await config.fetcher() } catch { /* expected: no data */ }

    const tasks = mockSettledWithConcurrency.mock.calls[0][0]
    expect(tasks).toHaveLength(1)
  })

  // ── Error resilience ──────────────────────────────────────────────────

  it('fetcher gracefully handles cluster audit failure (returns [] for that cluster)', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    // Make kubectl throw an unexpected error
    mockKubectlProxy.exec.mockRejectedValue(new Error('unexpected crash'))

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    // Should throw 'No data source available' because the task catches the error
    // and returns [], leading to an empty result overall
    await expect(config.fetcher()).rejects.toThrow('No data source available')
  })

  it('fetcher handles malformed JSON from kubectl gracefully', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    // Return valid exitCode but invalid JSON
    mockKubectlProxy.exec.mockResolvedValue({ output: 'not-json{{{', exitCode: 0 })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    // All checks return null from execJson, so no findings
    await expect(config.fetcher()).rejects.toThrow('No data source available')
  })

  // ── Context fallback ──────────────────────────────────────────────────

  it('fetcher uses cluster name as context fallback when context is empty', async () => {
    mockClusterCacheRef.clusters = [{ name: 'my-cluster', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    try { await config.fetcher() } catch { /* expected */ }

    // Verify kubectl was called with the cluster name as the context
    expect(mockKubectlProxy.exec).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ context: 'my-cluster' }),
    )
  })

  it('fetcher uses explicit context when provided by cluster cache', async () => {
    mockClusterCacheRef.clusters = [{ name: 'alias', context: 'real-ctx', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    try { await config.fetcher() } catch { /* expected */ }

    expect(mockKubectlProxy.exec).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ context: 'real-ctx' }),
    )
  })
})
