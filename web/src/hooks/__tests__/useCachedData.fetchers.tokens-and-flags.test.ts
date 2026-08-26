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
  describe('demo mode integration', () => {
      it('passes isDemoFallback through from cache result', async () => {
        mockUseCache.mockReturnValue(
          makeCacheResult([{ name: 'demo-pod' }], { isDemoFallback: true })
        )

        const { useCachedPods } = await loadModule()
        const result = useCachedPods()

        expect(result.isDemoFallback).toBe(true)
        expect(result.pods).toHaveLength(1)
      })

      it('every hook returns isDemoFallback field', async () => {
        mockUseCache.mockReturnValue(
          makeCacheResult([], { isDemoFallback: false })
        )

        const mod = await loadModule()

        // Test multiple hooks to ensure they all expose isDemoFallback
        expect(mod.useCachedPods().isDemoFallback).toBe(false)
        expect(mod.useCachedEvents().isDemoFallback).toBe(false)
        expect(mod.useCachedNodes().isDemoFallback).toBe(false)
        expect(mod.useCachedServices().isDemoFallback).toBe(false)
        expect(mod.useCachedWorkloads().isDemoFallback).toBe(false)
      })

      it('useCachedPodIssues skips REST when token is demo-token', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        localStorage.setItem('kc_token', 'demo-token')

        const { useCachedPodIssues } = await loadModule()
        useCachedPodIssues()

        const fetcher = capturedOpts.fetcher as () => Promise<unknown>
        // With demo-token and no agent clusters, should throw (no data source)
        await expect(fetcher()).rejects.toThrow()
      })
    })

  describe('refetch and subscriber notifications', () => {
      it('exposes refetch function from cache result', async () => {
        const mockRefetch = vi.fn().mockResolvedValue(undefined)
        mockUseCache.mockReturnValue(
          makeCacheResult([], { refetch: mockRefetch })
        )

        const { useCachedPods } = await loadModule()
        const result = useCachedPods()

        expect(result.refetch).toBe(mockRefetch)
      })

      it('refetch function can be called without arguments', async () => {
        const mockRefetch = vi.fn().mockResolvedValue(undefined)
        mockUseCache.mockReturnValue(
          makeCacheResult([], { refetch: mockRefetch })
        )

        const { useCachedEvents } = await loadModule()
        const result = useCachedEvents()

        await result.refetch()
        expect(mockRefetch).toHaveBeenCalledTimes(1)
      })
    })

  describe('localStorage token interactions', () => {
      it('fetcher reads token from localStorage via STORAGE_KEY_TOKEN', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        const mockFetchResponse = {
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

        const { useCachedPods } = await loadModule()
        useCachedPods('my-cluster')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown>
        await fetcher()

        // Verify Authorization header was set with the token
        const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[1].headers.Authorization).toBe('Bearer test-jwt-token')

        vi.unstubAllGlobals()
      })

      it('fetcher uses updated token after localStorage change', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        const mockFetchResponse = {
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

        localStorage.setItem('kc_token', 'updated-token')

        const { useCachedPods } = await loadModule()
        useCachedPods('my-cluster')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown>
        await fetcher()

        const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[1].headers.Authorization).toBe('Bearer updated-token')

        vi.unstubAllGlobals()
      })

      it('fetcher throws when localStorage token is removed mid-session', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        const { useCachedPods } = await loadModule()
        useCachedPods('my-cluster')

        // Remove token after hook is set up
        localStorage.removeItem('kc_token')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown>
        await expect(fetcher()).rejects.toThrow('No authentication token')
      })

      it('fetcher uses same-origin cookies when only kc-has-session is present', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        localStorage.removeItem('kc_token')
        localStorage.setItem('kc-has-session', 'true')
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'cookie-pod' }] })),
        }))

        const { useCachedPods } = await loadModule()
        useCachedPods('my-cluster')

        const fetcher = capturedOpts.fetcher as () => Promise<unknown>
        await fetcher()

        const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(fetchCall[1].credentials).toBe('same-origin')
        expect(fetchCall[1].headers.Authorization).toBeUndefined()
        expect(fetchCall[1].headers['X-Requested-With']).toBe('XMLHttpRequest')

        vi.unstubAllGlobals()
      })
    })

  describe('persist flag on hooks', () => {
      it('useCachedGPUNodeHealth sets persist: true', async () => {
        mockUseCache.mockReturnValue(makeCacheResult([]))
        const { useCachedGPUNodeHealth } = await loadModule()
        useCachedGPUNodeHealth()
        expect(mockUseCache.mock.calls[0][0].persist).toBe(true)
      })

      it('useCachedPods does NOT set persist', async () => {
        mockUseCache.mockReturnValue(makeCacheResult([]))
        const { useCachedPods } = await loadModule()
        useCachedPods()
        expect(mockUseCache.mock.calls[0][0].persist).toBeUndefined()
      })

      it('useCachedHardwareHealth sets persist: true', async () => {
        mockUseCache.mockReturnValue(makeCacheResult({ alerts: [], inventory: [], nodeCount: 0, lastUpdate: null }))
        const { useCachedHardwareHealth } = await loadModule()
        useCachedHardwareHealth()
        expect(mockUseCache.mock.calls[0][0].persist).toBe(true)
      })
    })

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
})
