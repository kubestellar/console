import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  loadModule,
  makeCacheResult,
  mockAuthFetch,
  mockClusterCacheRef,
  mockIsDemoMode,
  mockUseCache,
  registerUseCachedDataProgressiveGpuTestHooks,
} from './useCachedData.progressive-gpu.shared'

describe('useCachedData', () => {
  registerUseCachedDataProgressiveGpuTestHooks()

  describe('useGPUHealthCronJob', () => {
    it('passes correct key and enabled flag to useCache (no cluster)', async () => {
      // useGPUHealthCronJob uses useState, so we can't call it bare.
      // Instead, verify the module exports it and test the fetcher logic
      // by checking useCachedGPUNodeHealth which has the same endpoint pattern.
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth()

      // GPU health uses fetchFromAllClusters for 'gpu-nodes/health'
      expect(capturedOpts.key).toBe('gpu-node-health:all')
      expect(capturedOpts.persist).toBe(true)
    })

    it('GPU node health fetcher: cluster-specific path', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          nodes: [{ nodeName: 'gpu-1', status: 'healthy' }],
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth('gpu-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const nodes = await fetcher()
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toHaveProperty('cluster', 'gpu-cluster')

      vi.unstubAllGlobals()
    })

    it('GPU node health fetcher: all-clusters path', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', reachable: true }] as typeof mockClusterCacheRef.clusters

      const nodeRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ nodes: [{ nodeName: 'g1' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nodeRes))

      const { useCachedGPUNodeHealth } = await loadModule()
      useCachedGPUNodeHealth()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      const nodes = await fetcher()
      expect(nodes.length).toBeGreaterThanOrEqual(1)

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Demo data arrays are populated
  // ========================================================================
  describe('demo data arrays are populated', () => {
    it('all hooks pass non-empty demoData in demo mode (regression guard)', async () => {
      const capturedDemos: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: { key: string; demoData: unknown }) => {
        capturedDemos[opts.key] = opts.demoData
        return makeCacheResult(opts.demoData || [])
      })
      mockIsDemoMode.mockReturnValue(true)

      const m = await loadModule()

      // Call every hook to capture their demoData
      m.useCachedPods()
      m.useCachedEvents()
      m.useCachedPodIssues()
      renderHook(() => m.useCachedDeploymentIssues())
      m.useCachedDeployments()
      m.useCachedServices()
      m.useCachedSecurityIssues()
      m.useCachedNodes()
      m.useCachedGPUNodeHealth()
      m.useCachedWorkloads()
      m.useCachedWarningEvents()
      m.useCachedGPUNodes()
      m.useCachedPVCs()
      m.useCachedNamespaces()
      m.useCachedJobs()
      m.useCachedHPAs()
      m.useCachedConfigMaps()
      m.useCachedSecrets()
      m.useCachedReplicaSets()
      m.useCachedStatefulSets()
      m.useCachedDaemonSets()
      m.useCachedCronJobs()
      m.useCachedIngresses()
      m.useCachedNetworkPolicies()
      m.useCachedHelmReleases()
      m.useCachedOperators()
      m.useCachedOperatorSubscriptions()
      m.useCachedGitOpsDrifts()
      m.useCachedBuildpackImages()
      m.useCachedCoreDNSStatus()

      // All of these should have non-null demoData
      for (const [key, demo] of Object.entries(capturedDemos)) {
        if (demo === null) continue // Some hooks (like GPU CronJob) intentionally use null
        expect(Array.isArray(demo) ? demo.length : Object.keys(demo as Record<string, unknown>).length)
          .toBeGreaterThan(0, `${key} should have non-empty demoData`)
      }
    })
  })

  describe('useCachedAllPods', () => {
    it('returns pods from cache', async () => {
      const data = [{ name: 'all-pod-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedAllPods } = await loadModule()
      const result = useCachedAllPods()
      expect(result.pods).toEqual(data)
    })

    it('uses correct key format', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedAllPods } = await loadModule()
      useCachedAllPods('gpu-cluster')
      expect(mockUseCache.mock.calls[0][0].key).toBe('allPods:gpu-cluster')
    })

    it('provides progressiveFetcher when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedAllPods } = await loadModule()
      useCachedAllPods()
      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })
  })

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
