import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  loadModule,
  makeCacheResult,
  mockClusterCacheRef,
  mockFetchSSE,
  mockIsAgentUnavailable,
  mockUseCache,
  registerUseCachedDataProgressiveGpuTestHooks,
} from './useCachedData.progressive-gpu.shared'

describe('useCachedData', () => {
  registerUseCachedDataProgressiveGpuTestHooks()

  describe('getReachableClusters / getAgentClusters', () => {
    it('fetchClusters prefers local agent clusters over backend', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mutate the shared mock ref directly — avoids the `vi.doMock` +
      // `resetModules` race that caused kubestellar/console#9305.
      mockClusterCacheRef.clusters = [
        { name: 'agent-c1', reachable: true },
        { name: 'agent-c2', reachable: undefined }, // pending health check — included
        { name: 'agent-c3', reachable: false }, // unreachable — excluded
        { name: 'ns/long-path-name', reachable: true }, // long path — excluded
      ]

      const podRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(podRes))

      const { useCachedPods } = await loadModule()
      useCachedPods()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
      await fetcher()

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      // Should fetch pods from agent-c1 and agent-c2 (2 clusters), not from backend
      expect(fetchMock).toHaveBeenCalledTimes(2)

      vi.unstubAllGlobals()
    })
  })

  describe('deployment issues progressive fetcher', () => {
    it('uses the deployments progressive fetcher via agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          deployments: [{ name: 'dep1', replicas: 3, readyReplicas: 1, status: 'running' }],
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues())

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const onProgress = vi.fn()
      const deployments = await progressiveFetcher(onProgress)
      expect(deployments).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('falls back to the deployments SSE fetcher when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([
        { name: 'healthy-dep', namespace: 'default', replicas: 2, readyReplicas: 2, status: 'running' },
        { name: 'di1', namespace: 'default', replicas: 2, readyReplicas: 1, status: 'running' },
      ])

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues())

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<Array<{ name: string }>>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'healthy-dep' }),
        expect.objectContaining({ name: 'di1' }),
      ]))
    })
  })

  describe('deployments progressive fetcher', () => {
    it('uses agent when available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(false)

      const agentRes = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'd1' }] }) }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(mockFetchSSE).not.toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it('falls back to SSE when no agent', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
      mockIsAgentUnavailable.mockReturnValue(true)

      mockFetchSSE.mockResolvedValue([{ name: 'sse-dep' }])

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
      const result = await progressiveFetcher(vi.fn())
      expect(mockFetchSSE).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  // ========================================================================
  // Hook fetcher cluster-specific paths (cover lines 2156-2754)
  // ========================================================================
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
})
