import { describe, it, expect, vi } from 'vitest'
import {
  loadUseCachedDataModule as loadModule,
  makeCacheResult,
  mockAuthFetch,
  mockClusterCacheRef,
  mockUseCache,
  renderHook,
} from './__fixtures__/useCachedData'

describe('useCachedData', () => {
  describe('hook fetcher cluster-specific paths', () => {
      /** Helper: capture useCache opts, stub fetch for a single-cluster fetchAPI call */
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

      it('useCachedGPUNodes fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ nodes: [{ name: 'gpu-1', gpuType: 'A100' }] })
        const { useCachedGPUNodes } = await loadModule()
        useCachedGPUNodes('my-cluster')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      })

      it('useCachedAllPods fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ pods: [{ name: 'pod-1' }] })
        const { useCachedAllPods } = await loadModule()
        useCachedAllPods('my-cluster')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      })

      it('useCachedPVCs fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ pvcs: [{ name: 'pvc-1' }] })
        const { useCachedPVCs } = await loadModule()
        useCachedPVCs('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      })

      it('useCachedJobs fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ jobs: [{ name: 'job-1' }] })
        const { useCachedJobs } = await loadModule()
        useCachedJobs('my-cluster', 'batch')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      })

      it('useCachedHPAs fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ hpas: [{ name: 'hpa-1' }] })
        const { useCachedHPAs } = await loadModule()
        useCachedHPAs('my-cluster', 'prod')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedConfigMaps fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ configmaps: [{ name: 'cm-1' }] })
        const { useCachedConfigMaps } = await loadModule()
        useCachedConfigMaps('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedSecrets fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ secrets: [{ name: 'sec-1' }] })
        const { useCachedSecrets } = await loadModule()
        useCachedSecrets('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedServiceAccounts fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ serviceaccounts: [{ name: 'sa-1' }] })
        const { useCachedServiceAccounts } = await loadModule()
        useCachedServiceAccounts('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedReplicaSets fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ replicasets: [{ name: 'rs-1' }] })
        const { useCachedReplicaSets } = await loadModule()
        useCachedReplicaSets('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedStatefulSets fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ statefulsets: [{ name: 'sts-1' }] })
        const { useCachedStatefulSets } = await loadModule()
        useCachedStatefulSets('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedDaemonSets fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ daemonsets: [{ name: 'ds-1' }] })
        const { useCachedDaemonSets } = await loadModule()
        useCachedDaemonSets('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedCronJobs fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ cronjobs: [{ name: 'cj-1' }] })
        const { useCachedCronJobs } = await loadModule()
        useCachedCronJobs('my-cluster', 'batch')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedIngresses fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ ingresses: [{ name: 'ing-1' }] })
        const { useCachedIngresses } = await loadModule()
        useCachedIngresses('my-cluster', 'web')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedNetworkPolicies fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ networkpolicies: [{ name: 'np-1' }] })
        const { useCachedNetworkPolicies } = await loadModule()
        useCachedNetworkPolicies('my-cluster', 'frontend')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
      })

      it('useCachedServices fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ services: [{ name: 'svc-1', type: 'ClusterIP' }] })
        const { useCachedServices } = await loadModule()
        useCachedServices('my-cluster', 'ns')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
      })

      it('useCachedNodes fetcher: cluster-specific path', async () => {
        const { getCaptured } = setupClusterFetcher()
        stubFetchJSON({ nodes: [{ name: 'node-1', status: 'Ready' }] })
        const { useCachedNodes } = await loadModule()
        useCachedNodes('my-cluster')
        const fetcher = getCaptured().fetcher as () => Promise<unknown[]>
        const result = await fetcher()
        expect(result).toHaveLength(1)
        expect(result[0]).toHaveProperty('cluster', 'my-cluster')
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
})
