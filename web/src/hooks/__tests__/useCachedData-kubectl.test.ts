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

const mockClusterCacheRef = vi.hoisted(() => ({ clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> }))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
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
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../mcp/clusterCacheRef', () => ({
  clusterCacheRef: mockClusterCacheRef,
  setClusterCacheRefClusters: vi.fn(),
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
    retryFetch: vi.fn(),
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

  describe('security scanning via kubectl — additional branches', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('detects host PID and host IPC in separate pods', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'pid-pod', namespace: 'system' },
              spec: {
                hostPID: true,
                containers: [{ securityContext: { runAsNonRoot: true } }],
              },
            },
            {
              metadata: { name: 'ipc-pod', namespace: 'system' },
              spec: {
                hostIPC: true,
                containers: [{ securityContext: { runAsNonRoot: true } }],
              },
            },
          ],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; issue: string; severity: string }>>
      const issues = await fetcher()

      expect(issues.some(i => i.name === 'pid-pod' && i.issue === 'Host PID enabled')).toBe(true)
      expect(issues.some(i => i.name === 'ipc-pod' && i.issue === 'Host IPC enabled')).toBe(true)
    })

    it('detects capabilities added without dropping any', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'cap-pod', namespace: 'apps' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      capabilities: { add: ['SYS_ADMIN', 'NET_ADMIN'] },
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
      expect(issues.some(i => i.issue === 'Capabilities not dropped')).toBe(true)
    })

    it.skip('does NOT flag capabilities when caps are properly dropped', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'good-pod', namespace: 'secure' },
              spec: {
                containers: [
                  {
                    securityContext: {
                      runAsNonRoot: true,
                      readOnlyRootFilesystem: true,
                      capabilities: { drop: ['ALL'], add: ['NET_BIND_SERVICE'] },
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
      expect(issues.some(i => i.issue === 'Capabilities not dropped')).toBe(false)
    })

    it('filters by specific cluster when cluster arg provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [ { name: 'prod', context: 'prod-ctx', reachable: true }, { name: 'staging', context: 'staging-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      mockKubectlProxy.exec.mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({
          items: [{
            metadata: { name: 'test-pod', namespace: 'default' },
            spec: { hostNetwork: true, containers: [{ securityContext: { runAsNonRoot: true } }] },
          }],
        }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues('prod')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ cluster: string }>>
      const issues = await fetcher()

      // Should only have scanned 'prod' cluster, not 'staging'
      for (const issue of issues) {
        expect(issue.cluster).toBe('prod')
      }
      // kubectlProxy.exec should have been called once (only for prod)
      expect(mockKubectlProxy.exec).toHaveBeenCalledTimes(1)
    })

    it('security REST fallback returns empty on non-ok authFetch response', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // authFetch returns non-ok
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue(null),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // REST non-ok falls through to throw
      await expect(fetcher()).rejects.toThrow('No data source available')
    })

    it('security REST fallback returns empty when authFetch JSON has empty issues', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)
      mockIsBackendUnavailable.mockReturnValue(false)

      // authFetch returns ok but with empty issues
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ issues: [] }),
      })

      const { useCachedSecurityIssues } = await loadModule()
      useCachedSecurityIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      // Empty issues array doesn't satisfy `data.issues.length > 0`, falls through to throw
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })
})
