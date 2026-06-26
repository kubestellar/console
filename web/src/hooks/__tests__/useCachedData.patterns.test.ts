import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  loadModule,
  makeCacheResult,
  mockUseCache,
  registerUseCachedDataTestHooks,
} from './useCachedData.fetchers.shared'

describe('useCachedData', () => {
  registerUseCachedDataTestHooks()

  describe('fetchFromAllClusters edge cases', () => {
    it('throws when no clusters are available from any source', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // fetchClusters will call fetchAPI('clusters') which returns empty
      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods() // no cluster specified triggers fetchFromAllClusters

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No clusters available')

      vi.unstubAllGlobals()
    })

    it('accumulates pods from multiple clusters and sorts by restarts', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // First call gets cluster list, second/third get pods per cluster
      const clusterResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }, { name: 'c2', reachable: true }] })),
      }
      const podsC1 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1', restarts: 3 }] })),
      }
      const podsC2 = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p2', restarts: 10 }] })),
      }

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(clusterResponse) // fetchClusters fallback
        .mockResolvedValueOnce(podsC1)
        .mockResolvedValueOnce(podsC2)
      vi.stubGlobal('fetch', fetchMock)

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; restarts: number }>>
      const pods = await fetcher()

      // p2 (10 restarts) should come before p1 (3 restarts)
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Progressive fetcher patterns
  // ========================================================================
  describe('progressive fetcher patterns', () => {
    it('provides progressiveFetcher for services when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedServices } = await loadModule()
      useCachedServices()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressiveFetcher for services when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedServices } = await loadModule()
      useCachedServices('my-cluster')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('provides progressiveFetcher for warning events when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })

    it('omits progressiveFetcher for warning events when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents('prod-east')

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('omits progressiveFetcher for deployment issues when cluster specified', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues('my-cluster'))

      expect(capturedOpts.progressiveFetcher).toBeUndefined()
    })

    it('provides progressiveFetcher for nodes when no cluster', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedNodes } = await loadModule()
      useCachedNodes()

      expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
    })
  })

  // ========================================================================
  // Enabled flag — conditional fetching
  // ========================================================================
  describe('enabled flag for conditional hooks', () => {
    it('useCachedHelmHistory is disabled when release is missing', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('my-cluster', undefined)

      expect(capturedOpts.enabled).toBe(false)
    })

    it('useCachedHelmValues is disabled when cluster is missing', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues(undefined, 'my-release')

      expect(capturedOpts.enabled).toBe(false)
    })

    it('useCachedHelmValues is enabled when both cluster and release provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'my-release')

      expect(capturedOpts.enabled).toBe(true)
    })

    it('useCachedHelmHistory is enabled when both cluster and release provided', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('c1', 'my-release', 'ns')

      expect(capturedOpts.enabled).toBe(true)
    })

    it('useCachedHelmHistory key includes cluster, release, and namespace', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedHelmHistory } = await loadModule()
      useCachedHelmHistory('prod', 'nginx', 'web')

      expect(capturedOpts.key).toBe('helmHistory:prod:nginx:web')
    })
  })

  // ========================================================================
  // Cache key construction
  // ========================================================================
  describe('cache key construction', () => {
    it('useCachedWarningEvents includes limit in key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedWarningEvents } = await loadModule()
      useCachedWarningEvents('c1', 'ns', { limit: 25 })
      expect(mockUseCache.mock.calls[0][0].key).toBe('warningEvents:c1:ns:25')
    })

    it('useCachedDeployments uses all:all when no cluster/namespace', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()
      expect(mockUseCache.mock.calls[0][0].key).toBe('deployments:all:all')
    })

    it('useCachedPVCs includes cluster and namespace in key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs('prod', 'data')
      expect(mockUseCache.mock.calls[0][0].key).toBe('pvcs:prod:data')
    })

    it('useCachedCronJobs constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedCronJobs } = await loadModule()
      useCachedCronJobs('staging', 'batch')
      expect(mockUseCache.mock.calls[0][0].key).toBe('cronJobs:staging:batch')
    })

    it('useCachedIngresses constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedIngresses } = await loadModule()
      useCachedIngresses('prod', 'web')
      expect(mockUseCache.mock.calls[0][0].key).toBe('ingresses:prod:web')
    })

    it('useCachedNetworkPolicies constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedNetworkPolicies } = await loadModule()
      useCachedNetworkPolicies('prod', 'frontend')
      expect(mockUseCache.mock.calls[0][0].key).toBe('networkPolicies:prod:frontend')
    })

    it('useCachedSecrets constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedSecrets } = await loadModule()
      useCachedSecrets('prod', 'apps')
      expect(mockUseCache.mock.calls[0][0].key).toBe('secrets:prod:apps')
    })

    it('useCachedCoreDNSStatus constructs correct key', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedCoreDNSStatus } = await loadModule()
      useCachedCoreDNSStatus('gpu-cluster')
      expect(mockUseCache.mock.calls[0][0].key).toBe('coredns:gpu-cluster')
    })
  })

  // ========================================================================
  // Category assignment
  // ========================================================================
  describe('category assignment', () => {
    it('useCachedPVCs uses default category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPVCs } = await loadModule()
      useCachedPVCs()
      expect(mockUseCache.mock.calls[0][0].category).toBe('default')
    })

    it('useCachedNamespaces uses namespaces category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedNamespaces } = await loadModule()
      useCachedNamespaces()
      expect(mockUseCache.mock.calls[0][0].category).toBe('namespaces')
    })

    it('useCachedK8sRoles uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sRoles } = await loadModule()
      useCachedK8sRoles()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedK8sRoleBindings uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sRoleBindings } = await loadModule()
      useCachedK8sRoleBindings()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedK8sServiceAccounts uses rbac category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedK8sServiceAccounts } = await loadModule()
      useCachedK8sServiceAccounts()
      expect(mockUseCache.mock.calls[0][0].category).toBe('rbac')
    })

    it('useCachedOperators uses operators category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedOperators } = await loadModule()
      useCachedOperators()
      expect(mockUseCache.mock.calls[0][0].category).toBe('operators')
    })

    it('useCachedOperatorSubscriptions uses operators category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedOperatorSubscriptions } = await loadModule()
      useCachedOperatorSubscriptions()
      expect(mockUseCache.mock.calls[0][0].category).toBe('operators')
    })

    it('useCachedGitOpsDrifts uses gitops category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGitOpsDrifts } = await loadModule()
      useCachedGitOpsDrifts()
      expect(mockUseCache.mock.calls[0][0].category).toBe('gitops')
    })

    it('allows overriding category via options', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedPods } = await loadModule()
      useCachedPods(undefined, undefined, { category: 'realtime' })
      expect(mockUseCache.mock.calls[0][0].category).toBe('realtime')
    })
  })

  // ========================================================================
  // Return shape aliases (domain-specific field names)
  // ========================================================================
  describe('return shape aliases', () => {
    it('useCachedPVCs exposes .pvcs alias', async () => {
      const data = [{ name: 'pvc-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedPVCs } = await loadModule()
      const result = useCachedPVCs()
      expect(result.pvcs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedJobs exposes .jobs alias', async () => {
      const data = [{ name: 'job-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedJobs } = await loadModule()
      const result = useCachedJobs()
      expect(result.jobs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedHPAs exposes .hpas alias', async () => {
      const data = [{ name: 'hpa-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedHPAs } = await loadModule()
      const result = useCachedHPAs()
      expect(result.hpas).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedConfigMaps exposes .configmaps alias', async () => {
      const data = [{ name: 'cm-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedConfigMaps } = await loadModule()
      const result = useCachedConfigMaps()
      expect(result.configmaps).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedStatefulSets exposes .statefulsets alias', async () => {
      const data = [{ name: 'sts-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedStatefulSets } = await loadModule()
      const result = useCachedStatefulSets()
      expect(result.statefulsets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedDaemonSets exposes .daemonsets alias', async () => {
      const data = [{ name: 'ds-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedDaemonSets } = await loadModule()
      const result = useCachedDaemonSets()
      expect(result.daemonsets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedCronJobs exposes .cronjobs alias', async () => {
      const data = [{ name: 'cj-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedCronJobs } = await loadModule()
      const result = useCachedCronJobs()
      expect(result.cronjobs).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedIngresses exposes .ingresses alias', async () => {
      const data = [{ name: 'ing-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedIngresses } = await loadModule()
      const result = useCachedIngresses()
      expect(result.ingresses).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedNetworkPolicies exposes .networkpolicies alias', async () => {
      const data = [{ name: 'np-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedNetworkPolicies } = await loadModule()
      const result = useCachedNetworkPolicies()
      expect(result.networkpolicies).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedHelmReleases exposes .releases alias', async () => {
      const data = [{ name: 'rel-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedHelmReleases } = await loadModule()
      const result = useCachedHelmReleases()
      expect(result.releases).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedCoreDNSStatus exposes .clusters alias', async () => {
      const data = [{ cluster: 'c1', pods: [], healthy: true, totalRestarts: 0 }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedCoreDNSStatus } = await loadModule()
      const result = useCachedCoreDNSStatus()
      expect(result.clusters).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedReplicaSets exposes .replicasets alias', async () => {
      const data = [{ name: 'rs-1' }]
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedReplicaSets } = await loadModule()
      const result = useCachedReplicaSets()
      expect(result.replicasets).toEqual(data)
      expect(result.data).toEqual(data)
    })

    it('useCachedNamespaces exposes .namespaces alias', async () => {
      const data = ['default', 'kube-system']
      mockUseCache.mockReturnValue(makeCacheResult(data))
      const { useCachedNamespaces } = await loadModule()
      const result = useCachedNamespaces()
      expect(result.namespaces).toEqual(data)
      expect(result.data).toEqual(data)
    })
  })
})
