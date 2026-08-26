import { describe, it, expect, vi } from 'vitest'
import {
  loadUseCachedDataModule as loadModule,
  makeCacheResult,
  mockClusterCacheRef,
  mockIsDemoMode,
  mockIsBackendUnavailable,
  mockUseCache,
} from './__fixtures__/useCachedData'

describe('useCachedData', () => {
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
