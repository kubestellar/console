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

const { mockClusterCacheRef, mockIsDemoMode } = vi.hoisted(() => ({
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean; namespaces?: string[] }> },
  mockIsDemoMode: vi.fn(() => false),
}))

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

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
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
    createCachedHook: vi.fn(),
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
    createCachedHook: vi.fn(),
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/sseClient', () => ({
    createCachedHook: vi.fn(),
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  clusterCacheRef: mockClusterCacheRef,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  deduplicateClustersByServer: (clusters: unknown[]) => clusters,
}))

vi.mock('../mcp/clusterCacheRef', () => ({
  clusterCacheRef: mockClusterCacheRef,
  setClusterCacheRefClusters: vi.fn(),
}))

vi.mock('../useLocalAgent', () => ({
    createCachedHook: vi.fn(),
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
    createCachedHook: vi.fn(),
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
    createCachedHook: vi.fn(),
  fetchProwJobs: (...args: unknown[]) => mockFetchProwJobs(...args),
}))

vi.mock('../useCachedLLMd', () => ({
    createCachedHook: vi.fn(),
  fetchLLMdServers: (...args: unknown[]) => mockFetchLLMdServers(...args),
  fetchLLMdModels: (...args: unknown[]) => mockFetchLLMdModels(...args),
}))

vi.mock('../useCachedISO27001', () => ({
    createCachedHook: vi.fn(),}))

// Stub the re-exports so the module loads cleanly
vi.mock('../useWorkloads', () => ({
    createCachedHook: vi.fn(),}))

vi.mock('../../lib/schemas/validate', () => ({
    createCachedHook: vi.fn(),
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
  describe('GitOps and RBAC hook fetcher paths', () => {
    function setupClusterFetcher() {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(opts.initialData ?? [])
      })
      return { getCaptured: () => capturedOpts }
    }

    function stubFetchJSON(data: Record<string, unknown>) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
      }))
    }

    afterEach(() => { vi.unstubAllGlobals() })

    it('useCachedHelmReleases fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ releases: [{ name: 'rel-1', status: 'deployed' }] })
      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedHelmHistory fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ history: [{ revision: 1, status: 'deployed' }] })
      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('c1', 'my-release', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedHelmValues fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ values: { replicaCount: 3 } })
      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'my-release', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<Record<string, unknown>>
      const result = await fetcher()
      expect(result).toHaveProperty('replicaCount', 3)
    })

    it('useCachedOperators fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ operators: [{ name: 'op-1', status: 'Succeeded' }] })
      const { useCachedOperators } = await loadModule()
      useCachedOperators('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedOperatorSubscriptions fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ subscriptions: [{ name: 'sub-1' }] })
      const { useCachedOperatorSubscriptions } = await loadModule()
      useCachedOperatorSubscriptions('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedGitOpsDrifts fetcher calls fetchGitOpsAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ drifts: [{ resource: 'r1', driftType: 'modified' }] })
      const { useCachedGitOpsDrifts } = await loadModule()
      useCachedGitOpsDrifts('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedBuildpackImages fetcher: success path', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ images: [{ name: 'img-1', status: 'succeeded' }] })
      const { useCachedBuildpackImages } = await loadModule()
      useCachedBuildpackImages('my-cluster')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sRoles fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ roles: [{ name: 'admin', isCluster: true }] })
      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles('my-cluster', 'ns', { includeSystem: true })
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sRoleBindings fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ bindings: [{ name: 'binding-1' }] })
      const { useCachedK8sRoleBindings } = await loadModule()
      useCachedK8sRoleBindings('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })

    it('useCachedK8sServiceAccounts fetcher calls fetchRbacAPI', async () => {
      const { getCaptured } = setupClusterFetcher()
      stubFetchJSON({ serviceAccounts: [{ name: 'default' }] })
      const { useCachedK8sServiceAccounts } = await loadModule()
      useCachedK8sServiceAccounts('my-cluster', 'ns')
      const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
      const result = await fetcher()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // useGPUHealthCronJob — full install/uninstall coverage
  // useGPUHealthCronJob uses useState/useCallback so it requires renderHook
  // ========================================================================
  describe('useGPUHealthCronJob — full coverage', () => {
    it('fetcher returns null when cluster is falsy', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult(null)
      })

      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob())

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const result = await fetcher()
      expect(result).toBeNull()
      expect(capturedOpts.enabled).toBe(false)
      unmount()
    })

    it('fetcher calls fetchAPI when cluster provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({ installed: true })
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ installed: true })),
      }))

      const { renderHook } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const result = await fetcher()
      expect(result).toHaveProperty('installed', true)
      expect(capturedOpts.enabled).toBe(true)
      unmount()
      vi.unstubAllGlobals()
    })

    // #7993 Phase 3e: GPU health cronjob install/uninstall routes through
    // kc-agent (global `fetch` with LOCAL_AGENT_HTTP_URL), not the backend
    // `authFetch`. Tests mock `global.fetch` accordingly.
    it('install calls kc-agent with POST and refetches', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install({ namespace: 'gpu-health', schedule: '*/5 * * * *', tier: 3 })
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/gpu-health-cronjob'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(mockRefetch).toHaveBeenCalled()
      unmount()
    })

    it('install sets error on non-ok response', async () => {
      const mockRefetch = vi.fn()
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server Error'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install()
      })

      expect(fetchMock).toHaveBeenCalled()
      expect(result.current.error).toBe('Server Error')
      unmount()
    })

    it('install does nothing when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob())

      await act(async () => {
        await result.current.install()
      })

      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    })

    it('uninstall calls kc-agent with DELETE', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined)
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: mockRefetch }))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall({ namespace: 'gpu-health' })
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/gpu-health-cronjob'),
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(mockRefetch).toHaveBeenCalled()
      unmount()
    })

    it('uninstall sets error on non-ok response', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request'),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall()
      })

      expect(fetchMock).toHaveBeenCalled()
      expect(result.current.error).toBe('Bad Request')
      unmount()
    })

    it('uninstall does nothing when no cluster', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob())

      await act(async () => {
        await result.current.uninstall()
      })

      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    })

    it('install handles missing token', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      localStorage.removeItem('kc_token')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.install()
      })

      // Should not call fetch because getToken() returns null -> throws.
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.error).toBe('No authentication token')
      unmount()
    })

    it('uninstall handles missing token', async () => {
      mockUseCache.mockReturnValue(makeCacheResult(null, { refetch: vi.fn() }))
      localStorage.removeItem('kc_token')

      const { renderHook, act } = await import('@testing-library/react')
      const { useGPUHealthCronJob } = await loadModule()
      const { result, unmount } = renderHook(() => useGPUHealthCronJob('gpu-cluster'))

      await act(async () => {
        await result.current.uninstall()
      })

      expect(mockAuthFetch).not.toHaveBeenCalled()
      expect(result.current.error).toBe('No authentication token')
      unmount()
    })
  })
})
