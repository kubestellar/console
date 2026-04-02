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
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, KUBECTL_EXTENDED_TIMEOUT_MS: 60_000 }
})

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: (...args: unknown[]) => mockSettledWithConcurrency(...args),
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

  // ── Hook return shape ─────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    const { result } = renderHook(() => useCachedISO27001Audit())
    expect(result.current).toHaveProperty('findings')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })

  it('aliases data as findings', () => {
    const testData = [{ checkId: 'rbac-1', cluster: 'test' }]
    mockUseCache.mockReturnValue({ ...defaultCacheReturn(), data: testData })
    const { result } = renderHook(() => useCachedISO27001Audit())
    expect(result.current.findings).toBe(result.current.data)
  })

  // ── useCache configuration ────────────────────────────────────────────

  it('calls useCache with "pods" category', () => {
    renderHook(() => useCachedISO27001Audit())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'pods' }),
    )
  })

  it('uses key "iso27001Audit:all" when no cluster argument is given', () => {
    renderHook(() => useCachedISO27001Audit())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'iso27001Audit:all' }),
    )
  })

  it('uses cluster-specific key when cluster argument is provided', () => {
    renderHook(() => useCachedISO27001Audit('prod'))
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'iso27001Audit:prod' }),
    )
  })

  it('provides a progressiveFetcher when no cluster filter is set', () => {
    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    expect(config.progressiveFetcher).toBeDefined()
  })

  it('does NOT provide a progressiveFetcher when cluster filter is set', () => {
    renderHook(() => useCachedISO27001Audit('my-cluster'))
    const config = mockUseCache.mock.calls[0][0]
    expect(config.progressiveFetcher).toBeUndefined()
  })

  // ── Fetcher behaviour: agent unavailable ──────────────────────────────

  it('fetcher throws when agent is unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('No data source available')
  })

  it('fetcher throws when there are no clusters in the cache', async () => {
    mockClusterCacheRef.clusters = []

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('No data source available')
  })

  // ── Fetcher behaviour: successful audit ──────────────────────────────

  it('fetcher calls settledWithConcurrency with tasks when clusters are available', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'c1', reachable: true },
      { name: 'c2', reachable: true },
    ]
    mockSettledWithConcurrency.mockResolvedValue([
      { status: 'fulfilled', value: [{ checkId: 'rbac-1', cluster: 'c1' }] },
      { status: 'fulfilled', value: [{ checkId: 'rbac-1', cluster: 'c2' }] },
    ])

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(mockSettledWithConcurrency).toHaveBeenCalled()
    expect(result).toHaveLength(2)
  })

  it('fetcher filters out rejected results from settledWithConcurrency', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'c1', reachable: true },
      { name: 'c2', reachable: true },
    ]
    mockSettledWithConcurrency.mockResolvedValue([
      { status: 'fulfilled', value: [{ checkId: 'rbac-1', cluster: 'c1' }] },
      { status: 'rejected', reason: new Error('fail') },
    ])

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('c1')
  })

  it('fetcher throws when all cluster audits return empty results', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockResolvedValue([
      { status: 'fulfilled', value: [] },
    ])

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('No data source available')
  })

  // ── Cluster filtering (getAgentClusters) ───────────────────────────────

  it('fetcher excludes clusters with reachable === false', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'reachable', reachable: true },
      { name: 'unreachable', reachable: false },
    ]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      const results = await Promise.allSettled(tasks.map(t => t()))
      return results
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    // The fetcher will throw (no data), but we check what tasks were created
    try { await config.fetcher() } catch { /* expected */ }

    // settledWithConcurrency should have been called with exactly 1 task (only 'reachable')
    expect(mockSettledWithConcurrency).toHaveBeenCalled()
    const tasks = mockSettledWithConcurrency.mock.calls[0][0]
    expect(tasks).toHaveLength(1)
  })

  it('fetcher includes clusters with reachable === undefined (health check pending)', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'pending', reachable: undefined },
    ]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      const results = await Promise.allSettled(tasks.map(t => t()))
      return results
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    try { await config.fetcher() } catch { /* expected */ }

    expect(mockSettledWithConcurrency).toHaveBeenCalled()
    const tasks = mockSettledWithConcurrency.mock.calls[0][0]
    expect(tasks).toHaveLength(1)
  })

  it('fetcher skips clusters with "/" in name (long context-path duplicates)', async () => {
    mockClusterCacheRef.clusters = [
      { name: 'short-name', reachable: true },
      { name: 'default/api-fmaas-vllm-d-server:6443/admin', reachable: true },
    ]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      const results = await Promise.allSettled(tasks.map(t => t()))
      return results
    })
    mockKubectlProxy.exec.mockResolvedValue(kubectlError())

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]

    try { await config.fetcher() } catch { /* expected */ }

    const tasks = mockSettledWithConcurrency.mock.calls[0][0]
    expect(tasks).toHaveLength(1)
  })

  // ── runISO27001ChecksForCluster: RBAC checks ──────────────────────────

  it('fetcher produces rbac-1 pass when no cluster-admin outside kube-system', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]

    // Execute through the real task runner
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    // CRBs: only kube-system cluster-admin
    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') {
        return kubectlResult({
          items: [{ roleRef: { name: 'cluster-admin' }, metadata: { namespace: 'kube-system' } }],
        })
      }
      if (args[1] === 'clusterroles') {
        return kubectlResult({ items: [] })
      }
      if (args[1] === 'networkpolicies') {
        return kubectlResult({ items: [] })
      }
      if (args[1] === 'namespaces') {
        return kubectlResult({ items: [] })
      }
      if (args[1] === 'pods') {
        return kubectlResult({ items: [] })
      }
      if (args[1] === 'configmaps') {
        return kubectlResult({ items: [] })
      }
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const rbac1 = result.find((f: { checkId: string }) => f.checkId === 'rbac-1')
    expect(rbac1).toBeDefined()
    expect(rbac1.status).toBe('pass')
  })

  it('fetcher produces rbac-1 fail when cluster-admin exists outside kube-system', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') {
        return kubectlResult({
          items: [
            { roleRef: { name: 'cluster-admin' }, metadata: { namespace: 'default' } },
            { roleRef: { name: 'cluster-admin' }, metadata: { namespace: 'prod' } },
          ],
        })
      }
      if (args[1] === 'clusterroles') {
        return kubectlResult({ items: [] })
      }
      if (args[1] === 'networkpolicies') return kubectlResult({ items: [] })
      if (args[1] === 'namespaces') return kubectlResult({ items: [] })
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const rbac1 = result.find((f: { checkId: string }) => f.checkId === 'rbac-1')
    expect(rbac1.status).toBe('fail')
    expect(rbac1.details).toContain('2 cluster-admin binding(s)')
  })

  it('fetcher produces rbac-3 fail when > 2 wildcard ClusterRoles exist', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const wildcardRole = { rules: [{ verbs: ['*'], resources: ['pods'] }] }
    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlResult({ items: [] })
      if (args[1] === 'clusterroles') {
        return kubectlResult({ items: [wildcardRole, wildcardRole, wildcardRole] })
      }
      if (args[1] === 'networkpolicies') return kubectlResult({ items: [] })
      if (args[1] === 'namespaces') return kubectlResult({ items: [] })
      if (args[1] === 'pods') return kubectlResult({ items: [] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const rbac3 = result.find((f: { checkId: string }) => f.checkId === 'rbac-3')
    expect(rbac3).toBeDefined()
    expect(rbac3.status).toBe('fail')
  })

  // ── Pod Security checks ───────────────────────────────────────────────

  it('fetcher produces pod-2 fail for privileged containers', async () => {
    mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }]
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })

    const privilegedPod = {
      metadata: { name: 'bad-pod', namespace: 'default' },
      spec: {
        containers: [{ image: 'nginx:1.0', securityContext: { privileged: true } }],
      },
    }

    mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
      if (args[1] === 'clusterrolebindings') return kubectlError()
      if (args[1] === 'networkpolicies') return kubectlError()
      if (args[1] === 'namespaces') return kubectlError()
      if (args[1] === 'pods') return kubectlResult({ items: [privilegedPod] })
      if (args[1] === 'configmaps') return kubectlResult({ items: [] })
      return kubectlError()
    })

    renderHook(() => useCachedISO27001Audit())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    const pod2 = result.find((f: { checkId: string }) => f.checkId === 'pod-2')
    expect(pod2).toBeDefined()
    expect(pod2.status).toBe('fail')
    expect(pod2.severity).toBe('critical')
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
