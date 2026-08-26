import { describe, it, expect, vi } from 'vitest'
import {
  loadUseCachedDataModule as loadModule,
  makeCacheResult,
  mockClusterCacheRef,
  mockFetchSSE,
  mockIsAgentUnavailable,
  mockIsBackendUnavailable,
  mockKubectlProxy,
  mockUseCache,
  renderHook,
} from './__fixtures__/useCachedData'

describe('useCachedData', () => {
  describe('local agent fetcher paths', () => {
      it('useCachedPodIssues fetcher uses agent when clusters available', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)
        mockKubectlProxy.getPodIssues.mockResolvedValue([
          { name: 'crash-pod', namespace: 'default', status: 'CrashLoopBackOff', restarts: 5 },
        ])

        const { useCachedPodIssues } = await loadModule()
        useCachedPodIssues('prod')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const issues = await fetcher()
        expect(issues).toHaveLength(1)
        expect(issues[0]).toHaveProperty('cluster', 'prod')
        expect(mockKubectlProxy.getPodIssues).toHaveBeenCalledWith('prod-ctx', undefined)
      })

      it('useCachedPodIssues fetcher: agent all-clusters path uses fetchPodIssuesViaAgent', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [ { name: 'c1', context: 'c1-ctx', reachable: true }, { name: 'c2', context: 'c2-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)
        mockKubectlProxy.getPodIssues.mockResolvedValue([
          { name: 'issue-pod', namespace: 'default', status: 'Error', restarts: 2 },
        ])

        const { useCachedPodIssues } = await loadModule()
        useCachedPodIssues() // no cluster -> all clusters via agent

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const issues = await fetcher()
        // Both clusters produce one issue each, sorted by restarts
        expect(issues.length).toBeGreaterThanOrEqual(1)
      })

      it('useCachedPodIssues fetcher: falls back to REST when agent unavailable', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(false)

        const clusterRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ clusters: [{ name: 'c1', reachable: true }] })) }
        const issueRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ issues: [{ name: 'rest-issue', restarts: 1 }] })) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(clusterRes).mockResolvedValueOnce(issueRes))

        const { useCachedPodIssues } = await loadModule()
        useCachedPodIssues()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const issues = await fetcher()
        expect(issues.length).toBeGreaterThanOrEqual(1)

        vi.unstubAllGlobals()
      })

      it('useCachedDeployments fetcher uses agent for single cluster', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        // Mock fetch for agent HTTP endpoint
        const agentRes = {
          ok: true,
          json: vi.fn().mockResolvedValue({ deployments: [{ name: 'dep1', namespace: 'default' }] }),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

        const { useCachedDeployments } = await loadModule()
        useCachedDeployments('prod')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const deployments = await fetcher()
        expect(deployments).toHaveLength(1)
        expect(deployments[0]).toHaveProperty('cluster', 'prod')

        vi.unstubAllGlobals()
      })

      it('useCachedDeployments fetcher: agent returns non-ok response for single cluster', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [ { name: 'prod', context: 'prod-ctx', reachable: true }, { name: 'staging', context: 'staging-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        // Non-ok for single-cluster call, then ok for fetchDeploymentsViaAgent fallback
        const agentNonOk = { ok: false, status: 500, json: vi.fn() }
        const agentOk = { ok: true, json: vi.fn().mockResolvedValue({ deployments: [{ name: 'dep2' }] }) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(agentNonOk).mockResolvedValue(agentOk))

        const { useCachedDeployments } = await loadModule()
        useCachedDeployments('prod')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const deployments = await fetcher()
        // Falls through to fetchDeploymentsViaAgent
        expect(Array.isArray(deployments)).toBe(true)

        vi.unstubAllGlobals()
      })

      it('useCachedDeployments fetcher: agent JSON parse fails returns empty for single cluster', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        // ok but invalid JSON
        const agentBadJson = { ok: true, json: vi.fn().mockRejectedValue(new Error('invalid json')) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentBadJson))

        const { useCachedDeployments } = await loadModule()
        useCachedDeployments('prod')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const deployments = await fetcher()
        expect(deployments).toEqual([])

        vi.unstubAllGlobals()
      })

      it('useCachedDeployments fetcher: falls back to REST API when no agent', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(false)

        const restRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ deployments: [{ name: 'rest-dep' }] })) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

        const { useCachedDeployments } = await loadModule()
        useCachedDeployments('my-cluster')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const deployments = await fetcher()
        expect(deployments).toHaveLength(1)

        vi.unstubAllGlobals()
      })

      it('useCachedDeployments fetcher: throws when both agent and backend unavailable', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(true)

        const { useCachedDeployments } = await loadModule()
        useCachedDeployments()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        await expect(fetcher()).rejects.toThrow('No data source available')
      })
    })

  describe('workloads agent path', () => {
      it('useCachedWorkloads fetcher tries agent first', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        const agentRes = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            deployments: [
              { name: 'web', namespace: 'default', status: 'running', replicas: 3, readyReplicas: 3 },
              { name: 'api', namespace: 'default', status: 'failed', replicas: 2, readyReplicas: 0 },
              { name: 'worker', namespace: 'default', status: 'deploying', replicas: 1, readyReplicas: 0 },
              { name: 'cache', namespace: 'default', status: 'running', replicas: 2, readyReplicas: 1 },
            ],
          }),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

        const { useCachedWorkloads } = await loadModule()
        useCachedWorkloads()

        const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; status: string }>>
        const workloads = await fetcher()

        expect(workloads).toHaveLength(4)
        // Verify status mapping
        const web = workloads.find(w => w.name === 'web')
        expect(web?.status).toBe('Running')
        const api = workloads.find(w => w.name === 'api')
        expect(api?.status).toBe('Failed')
        const worker = workloads.find(w => w.name === 'worker')
        expect(worker?.status).toBe('Pending')
        const cache = workloads.find(w => w.name === 'cache')
        expect(cache?.status).toBe('Degraded')

        vi.unstubAllGlobals()
      })

      it('useCachedWorkloads fetcher falls back to REST when agent returns null', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(false)

        const restRes = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            items: [
              { name: 'rest-wl', namespace: 'prod', type: 'Deployment', cluster: 'c1', status: 'Running', replicas: 1, readyReplicas: 1 },
            ],
          }),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

        const { useCachedWorkloads } = await loadModule()
        useCachedWorkloads()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const workloads = await fetcher()
        expect(workloads).toHaveLength(1)

        vi.unstubAllGlobals()
      })

      it('useCachedWorkloads fetcher: REST non-ok returns empty', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(false)

        const badRes = { ok: false, status: 500 }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badRes))

        const { useCachedWorkloads } = await loadModule()
        useCachedWorkloads()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const workloads = await fetcher()
        expect(workloads).toEqual([])

        vi.unstubAllGlobals()
      })

      it('useCachedWorkloads fetcher: REST json parse fails returns empty', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(false)

        const badJsonRes = { ok: true, json: vi.fn().mockResolvedValue(null) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(badJsonRes))

        const { useCachedWorkloads } = await loadModule()
        useCachedWorkloads()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const workloads = await fetcher()
        expect(workloads).toEqual([])

        vi.unstubAllGlobals()
      })

      it('useCachedWorkloads fetcher: no agent, no backend returns empty', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockIsAgentUnavailable.mockReturnValue(true)
        mockIsBackendUnavailable.mockReturnValue(true)

        const { useCachedWorkloads } = await loadModule()
        useCachedWorkloads()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const workloads = await fetcher()
        expect(workloads).toEqual([])
      })
    })

  describe('deployment issues agent path', () => {
      it('useCachedDeploymentIssues reuses deployments from the agent fetcher', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        const agentRes = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            deployments: [
              { name: 'healthy-dep', namespace: 'default', status: 'running', replicas: 3, readyReplicas: 3 },
              { name: 'unhealthy-dep', namespace: 'default', status: 'failed', replicas: 2, readyReplicas: 0 },
            ],
          }),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

        const { useCachedDeploymentIssues } = await loadModule()
        renderHook(() => useCachedDeploymentIssues())

        const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; cluster?: string }>>
        const deployments = await fetcher()

        expect(deployments).toHaveLength(2)
        expect(deployments).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: 'healthy-dep', cluster: 'prod' }),
          expect.objectContaining({ name: 'unhealthy-dep', cluster: 'prod' }),
        ]))

        vi.unstubAllGlobals()
      })

      it('useCachedDeploymentIssues: single cluster agent path', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'prod', context: 'prod-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        const agentRes = {
          ok: false,
          status: 500,
          json: vi.fn(),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(agentRes))

        const { useCachedDeploymentIssues } = await loadModule()
        renderHook(() => useCachedDeploymentIssues('prod'))

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const issues = await fetcher()
        expect(issues).toEqual([])

        vi.unstubAllGlobals()
      })
    })

  describe('events fetcher multi-cluster agent path', () => {
      it('fetches events from all agent clusters and sorts by lastSeen', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [ { name: 'c1', context: 'c1-ctx', reachable: true }, { name: 'c2', context: 'c2-ctx', reachable: true }, ] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        const now = Date.now()
        mockKubectlProxy.getEvents
          .mockResolvedValueOnce([{ type: 'Warning', reason: 'BackOff', lastSeen: new Date(now - 60000).toISOString() }])
          .mockResolvedValueOnce([{ type: 'Normal', reason: 'Started', lastSeen: new Date(now).toISOString() }])

        const { useCachedEvents } = await loadModule()
        useCachedEvents() // no cluster -> all clusters

        const fetcher = capturedOpts.fetcher as () => Promise<Array<{ type: string; cluster: string }>>
        const events = await fetcher()
        expect(events.length).toBe(2)
        // Most recent event first (c2's event is more recent)
        expect(events[0]).toHaveProperty('cluster', 'c2')
        expect(events[1]).toHaveProperty('cluster', 'c1')
      })

      it('events progressive fetcher uses agent when available', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [{ name: 'c1', context: 'c1-ctx', reachable: true }] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(false)

        mockKubectlProxy.getEvents.mockResolvedValue([{ type: 'Normal', reason: 'OK' }])

        const { useCachedEvents } = await loadModule()
        useCachedEvents()

        const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
        const onProgress = vi.fn()
        const events = await progressiveFetcher(onProgress)

        expect(onProgress).toHaveBeenCalled()
        expect(events.length).toBeGreaterThanOrEqual(1)
      })

      it('events fetcher falls back to REST when agent has no clusters', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(true)

        const restRes = { ok: true, text: vi.fn().mockResolvedValue(JSON.stringify({ events: [{ type: 'Warning', reason: 'REST' }] })) }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(restRes))

        const { useCachedEvents } = await loadModule()
        useCachedEvents('cluster-1')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown[]>
        const events = await fetcher()
        expect(events).toHaveLength(1)

        vi.unstubAllGlobals()
      })
    })
})
