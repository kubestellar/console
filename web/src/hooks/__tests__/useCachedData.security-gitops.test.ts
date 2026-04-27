/**
 * Deep branch-coverage tests for useCachedData.ts
 *
 * Tests the internal utility functions (fetchAPI, fetchClusters,
 * fetchFromAllClusters, fetchViaSSE, etc.) and every exported
 * useCached* hook by mocking the underlying cache layer and network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockUseCache = vi.fn()
const mockIsBackendUnavailable = vi.fn(() => false)
const mockAuthFetch = vi.fn()
const mockIsAgentUnavailable = vi.fn(() => true)
const mockFetchSSE = vi.fn()
const mockKubectlProxy = {
  getEvents: vi.fn(),
  getPodIssues: vi.fn(),
  exec: vi.fn(),
}
const mockSettledWithConcurrency = vi.fn()
const mockFetchProwJobs = vi.fn()
const mockFetchLLMdServers = vi.fn()
const mockFetchLLMdModels = vi.fn()

// Shared mutable cluster-cache ref — the hoisted `vi.mock('../mcp/shared', ...)`
// below returns this same object reference, so tests can mutate `.clusters`
// directly instead of calling `vi.doMock` (which is unreliable on the first
// test-after-resetModules in CI — see kubestellar/console#9305).
const mockClusterCacheRef = vi.hoisted(() => ({ clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> }))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  REFRESH_RATES: {
    realtime: 15_000, pods: 30_000, clusters: 60_000,
    deployments: 60_000, services: 60_000, metrics: 45_000,
    gpu: 45_000, helm: 120_000, gitops: 120_000,
    namespaces: 180_000, rbac: 300_000, operators: 300_000,
    costs: 600_000, default: 120_000,
  },
}))

vi.mock('../../lib/api', () => ({
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8765',
  STORAGE_KEY_TOKEN: 'kc_token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  AI_PREDICTION_TIMEOUT_MS: 30_000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 60_000,
} })

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: async (...args: unknown[]) => {
    const result = await mockSettledWithConcurrency(...args)
    // Invoke the onSettled callback (3rd arg) so the production code's
    // accumulation logic runs.  Without this, tests that use mockResolvedValue
    // silently skip the callback and return empty results.
    const onSettled = args[2] as ((r: PromiseSettledResult<unknown>, i: number) => void) | undefined
    if (onSettled && Array.isArray(result)) {
      result.forEach((r: PromiseSettledResult<unknown>, i: number) => onSettled(r, i))
    }
    return result
  },
}))

vi.mock('../useCachedProw', () => ({
  fetchProwJobs: (...args: unknown[]) => mockFetchProwJobs(...args),
}))

vi.mock('../useCachedLLMd', () => ({
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
  fetchLLMdModels: (...args: unknown[]) => mockFetchLLMdModels(...args),
}))

vi.mock('../useCachedISO27001', () => ({}))

// Stub the re-exports so the module loads cleanly
vi.mock('../useWorkloads', () => ({}))

vi.mock('../../lib/schemas/validate', () => ({
  validateResponse: (_schema: unknown, data: unknown) => data,
  validateArrayResponse: (_schema: unknown, data: unknown) => data,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default shape returned by our mocked useCache */
function makeCacheResult<T>(data: T, overrides?: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCachedData', () => {
  let mod: typeof import('../useCachedData')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    // Set a valid token so fetchAPI doesn't throw
    localStorage.setItem('kc_token', 'test-jwt-token')
    // Reset the shared cluster cache so tests start with a clean slate
    mockClusterCacheRef.clusters = []
    // Default useCache implementation
    mockUseCache.mockImplementation((opts: { initialData: unknown }) =>
      makeCacheResult(opts.initialData)
    )
    // Default settledWithConcurrency: run tasks and return settled results
    mockSettledWithConcurrency.mockImplementation(async (tasks: Array<() => Promise<unknown>>) => {
      return Promise.allSettled(tasks.map(t => t()))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Lazy-load module after mocks are set up
  async function loadModule() {
    mod = await import('../useCachedData')
    return mod
  }

  // ========================================================================
  // useCachedPods
  // ========================================================================

  // ========================================================================
  // Security issues via kubectl scanning
  // ========================================================================
  describe('security issues kubectl scanning', () => {
    it('useCachedSecurityIssues fetcher: agent kubectl finds privileged containers', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mutate the shared mock ref directly — avoids the `vi.doMock` +
      // `resetModules` race that caused kubestellar/console#9305.
      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }]
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'bad-pod', namespace: 'default' },
              spec: {
                containers: [
                  { securityContext: { privileged: true } },
                ],
                hostNetwork: true,
                hostPID: true,
                hostIPC: true,
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string; severity: string }>>
      const issues = await fetcher()

      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Privileged container')
      expect(issueTypes).toContain('Host network enabled')
      expect(issueTypes).toContain('Host PID enabled')
      expect(issueTypes).toContain('Host IPC enabled')
    })

    it('useCachedSecurityIssues fetcher: detects root user and missing security context', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'root-pod', namespace: 'apps' },
              spec: {
                securityContext: { runAsUser: 0 },
                containers: [
                  { securityContext: { runAsUser: 0 } },
                ],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string }>>
      const issues = await fetcher()
      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Running as root')
    })

    it('useCachedSecurityIssues fetcher: detects capabilities not dropped', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'cap-pod', namespace: 'system' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      capabilities: { add: ['NET_ADMIN'], drop: [] },
                    },
                  },
                ],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ issue: string }>>
      const issues = await fetcher()
      const issueTypes = issues.map(i => i.issue)
      expect(issueTypes).toContain('Capabilities not dropped')
    })

    it('useCachedSecurityIssues fetcher: kubectl non-zero exit returns empty', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'prod', context: 'prod-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({ exitCode: 1, output: 'error' })

      // Need REST fallback to also fail so we hit the throw path
      mockIsBackendUnavailable.mockReturnValue(true)

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      // kubectl returned nothing, REST unavailable => throws
      await expect(fetcher()).rejects.toThrow('No data source available')
    })

    it('useCachedSecurityIssues fetcher: falls back to REST authFetch', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // fetchBackendAPI uses raw fetch(), not authFetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'rest-sec', namespace: 'default', issue: 'Priv', severity: 'high' }] })),
      }))

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const issues = await fetcher()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Hardware health fetcher
  // ========================================================================
  describe('hardware health fetcher', () => {
    it('useCachedHardwareHealth: fetches alerts and inventory from agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ alerts: [{ id: 'a1', severity: 'critical' }], nodeCount: 2, timestamp: new Date().toISOString() }),
      }
      const inventoryRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: [{ nodeName: 'n1', cluster: 'c1' }], timestamp: new Date().toISOString() }),
      }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsRes)
        .mockResolvedValueOnce(inventoryRes))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ alerts: unknown[]; inventory: unknown[]; nodeCount: number }>
      const result = await fetcher()
      expect(result.alerts).toHaveLength(1)
      expect(result.inventory).toHaveLength(1)
      expect(result.nodeCount).toBe(1) // inventory nodes.length overrides

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: throws when both endpoints fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const failedRes = { ok: false, status: 503 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failedRes))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('Device endpoints unavailable')

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: handles fetch network errors gracefully', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      // Both fetches throw network errors (caught by .catch(() => null))
      // The catch in Promise.all turns them to null
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // Both null => !ok && !ok => throws
      await expect(fetcher()).rejects.toThrow()

      vi.unstubAllGlobals()
    })

    it('useCachedHardwareHealth: partial success (alerts ok, inventory fails)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null })
      })

      const alertsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({ alerts: [{ id: 'a1' }], nodeCount: 5, timestamp: new Date().toISOString() }),
      }
      const inventoryFail = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(alertsRes)
        .mockResolvedValueOnce(inventoryFail))

      const { useCachedHardwareHealth } = await loadModule()
      useCachedHardwareHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<{ alerts: unknown[]; inventory: unknown[]; nodeCount: number }>
      const result = await fetcher()
      expect(result.alerts).toHaveLength(1)
      expect(result.inventory).toEqual([])
      expect(result.nodeCount).toBe(5)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // CoreDNS status computation
  // ========================================================================
  describe('CoreDNS status computation', () => {
    it('useCachedCoreDNSStatus filters and groups CoreDNS pods by cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Cluster list and pods
      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const podsRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-abc', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 2, containers: [{ image: 'coredns:v1.11.1' }] },
            { name: 'coredns-def', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0 },
            { name: 'nginx-xyz', namespace: 'kube-system', status: 'Running', ready: '1/1', restarts: 0 },
          ],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(podsRes))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string; healthy: boolean; totalRestarts: number; pods: unknown[] }>>
      const result = await fetcher()

      // Should only include coredns pods, not nginx
      expect(result).toHaveLength(1)
      expect(result[0].pods).toHaveLength(2)
      expect(result[0].healthy).toBe(true)
      expect(result[0].totalRestarts).toBe(2)

      vi.unstubAllGlobals()
    })

    it('useCachedCoreDNSStatus: unhealthy when some pods not Running', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const restRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'coredns-abc', namespace: 'kube-system', status: 'CrashLoopBackOff', ready: '0/1', restarts: 15, cluster: 'c1' },
          ],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('c1')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ healthy: boolean }>>
      const result = await fetcher()

      expect(result).toHaveLength(1)
      expect(result[0].healthy).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Namespaces fetcher (custom endpoint)
  // ========================================================================
  describe('namespaces fetcher', () => {
    it('useCachedNamespaces: returns demo data when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces() // no cluster

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('default')
      expect(namespaces).toContain('kube-system')
    })

    it('useCachedNamespaces: fetches from /api/namespaces when cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const nsRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'production' },
          { Name: 'staging' },
          { name: '' }, // empty name filtered out
        ]),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nsRes))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      const namespaces = await fetcher()
      expect(namespaces).toContain('production')
      expect(namespaces).toContain('staging')
      expect(namespaces).not.toContain('')

      vi.unstubAllGlobals()
    })

    it('useCachedNamespaces: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<string[]>
      await expect(fetcher()).rejects.toThrow('API error: 403')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Buildpack images 404 handling
  // ========================================================================
  describe('buildpack images 404 handling', () => {
    it('useCachedBuildpackImages: returns empty array on 404 (no CRDs)', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchGitOpsAPI will throw with '404' in message
      const errorRes = { ok: false, status: 404 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const images = await fetcher()
      expect(images).toEqual([])

      vi.unstubAllGlobals()
    })

    it('useCachedBuildpackImages: rethrows non-404 errors', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const errorRes = { ok: false, status: 500 }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorRes))

      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('500')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // GitOps and RBAC API endpoints
  // ========================================================================
  describe('GitOps and RBAC API endpoints', () => {
    it('useCachedHelmReleases uses fetchGitOpsAPI', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const gitopsRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ releases: [{ name: 'prometheus' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gitopsRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const releases = await fetcher()
      expect(releases).toHaveLength(1)

      // Verify it used /api/gitops/ prefix
      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/gitops/')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const badRes = { ok: true, text: vi.fn().mockResolvedValue('not json') }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badRes))

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsAPI: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedK8sRoles uses fetchRbacAPI with /api/rbac/ prefix', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const rbacRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ roles: [{ name: 'admin' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rbacRes))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('c1', 'ns', { includeSystem: true })

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const roles = await fetcher()
      expect(roles).toHaveLength(1)

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('/api/rbac/')
      expect(calledUrl).toContain('includeSystem=true')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-ok response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 401')

      vi.unstubAllGlobals()
    })

    it('fetchRbacAPI: throws on non-JSON response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('bad json!') }))

      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('fetchGitOpsSSE used by helmReleases progressive fetcher', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockFetchSSE.mockResolvedValue([{ name: 'sse-release' }])

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases() // no cluster

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })

    it('fetchGitOpsSSE: throws when no token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow()
    })

    it('fetchGitOpsSSE: throws when demo-token', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.setItem('kc_token', 'demo-token')

      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      await expect(progressiveFetcher(vi.fn())).rejects.toThrow('No data source available')
    })
  })

  // ========================================================================
  // coreFetchers direct invocation
  // ========================================================================
  describe('coreFetchers direct invocation', () => {
    it('coreFetchers.podIssues uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockKubectlProxy.getPodIssues.mockResolvedValue([
        { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 3 },
      ])
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)
    })

    it('coreFetchers.podIssues falls back to REST when no agent', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
      const issueRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'p1', restarts: 1 }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(issueRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.podIssues returns empty when both unavailable', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(true)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.podIssues()
      expect(issues).toEqual([])
    })

    it('coreFetchers.deploymentIssues uses agent and derives issues', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [
            { name: 'dep1', namespace: 'ns', replicas: 3, readyReplicas: 1, status: 'running' },
          ],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.deploymentIssues()
      expect(issues).toHaveLength(1)
      expect(issues[0]).toHaveProperty('reason', 'ReplicaFailure')

      vi.unstubAllGlobals()
    })

    it('coreFetchers.deployments uses agent when available', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: {
          clusters: [{ name: 'c1', context: 'c1-ctx', reachable: true }],
        },
      }))
      mockIsAgentUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const agentRes = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'd1' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { coreFetchers } = await loadModule()
      const deps = await coreFetchers.deployments()
      expect(deps.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.securityIssues tries kubectl then REST', async () => {
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      // fetchBackendAPI uses raw fetch(), not authFetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'sec1', namespace: 'default', issue: 'Priv', severity: 'high' }] })),
      }))

      const { coreFetchers } = await loadModule()
      const issues = await coreFetchers.securityIssues()
      expect(issues).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('coreFetchers.workloads uses agent then REST fallback', async () => {
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)
      mockUseCache.mockReturnValue(makeCacheResult([]))

      const restRes = {
        ok: true,
        json: vi.fn().mockResolvedValue([
          { name: 'wl1', namespace: 'prod', type: 'Deployment', cluster: 'c1', status: 'Running', replicas: 1, readyReplicas: 1 },
        ]),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

      const { coreFetchers } = await loadModule()
      const workloads = await coreFetchers.workloads()
      expect(workloads).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // fetchFromAllClusters — partial failures
  // ========================================================================
  describe('fetchFromAllClusters partial failures', () => {
    it('returns data from successful clusters even if some fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }
      const podsC1 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1', restarts: 0 }] })),
      }
      const podsC2 = {
        ok: false,
        status: 500,
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsC1)
        .mockResolvedValueOnce(podsC2))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()
      // Should still have pods from c1 even though c2 failed
      expect(pods.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })

    it('throws when ALL cluster fetches fail', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }],
        })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValue({ ok: false, status: 500 }))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await expect(fetcher()).rejects.toThrow('All cluster fetches failed')

      vi.unstubAllGlobals()
    })

    it('filters out unreachable clusters and clusters with / in name', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const clusterRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          clusters: [
            { name: 'good', reachable: true },
            { name: 'unreachable', reachable: false },
            { name: 'default/api-server:6443', reachable: true }, // long context path, should be filtered
          ],
        })),
      }
      const podsRes = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }

      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(clusterRes)
        .mockResolvedValueOnce(podsRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const pods = await fetcher()

      // Only 'good' cluster should be fetched — 1 cluster response + 1 pods response = 2 fetch calls total
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // First call = clusters, second call = pods for 'good'
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(pods).toHaveLength(1)

      vi.unstubAllGlobals()
    })
  })
})
