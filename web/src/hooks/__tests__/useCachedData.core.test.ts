import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  loadModule,
  makeCacheResult,
  mockIsAgentUnavailable,
  mockIsBackendUnavailable,
  mockUseCache,
  registerUseCachedDataTestHooks,
} from './useCachedData.fetchers.shared'

describe('useCachedData', () => {
  registerUseCachedDataTestHooks()

  describe('fetcher branch coverage', () => {
    it('useCachedPods fetcher: cluster-specific path', async () => {
      // Capture the useCache options so we can call the fetcher directly
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      // Mock global fetch
      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [{ name: 'p1' }] })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', 'default')

      // Call the fetcher
      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      const pods = await fetcher()
      expect(Array.isArray(pods)).toBe(true)

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: no token throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      localStorage.removeItem('kc_token')

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No authentication token')
    })

    it('useCachedPods fetcher: non-JSON response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('non-JSON')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: non-ok response throws', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: false,
        status: 500,
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('API error: 500')

      vi.unstubAllGlobals()
    })

    it('useCachedPods fetcher: sorts by restarts descending', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          pods: [
            { name: 'p1', restarts: 1 },
            { name: 'p2', restarts: 10 },
            { name: 'p3', restarts: 0 },
          ]
        })),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse))

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster')

      const fetcher = capturedOpts.fetcher as () => Promise<Array<{ name: string; restarts: number }>>
      const pods = await fetcher()
      expect(pods[0].name).toBe('p2')
      expect(pods[1].name).toBe('p1')
      expect(pods[2].name).toBe('p3')

      vi.unstubAllGlobals()
    })

    it('fetchAPI: skips undefined params', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const mockFetchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ pods: [] })),
      }
      const fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse)
      vi.stubGlobal('fetch', fetchSpy)

      const { useCachedPods } = await loadModule()
      useCachedPods('my-cluster', undefined)

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await fetcher()

      // Verify the URL doesn't have undefined in it
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('undefined')
      expect(calledUrl).toContain('cluster=my-cluster')

      vi.unstubAllGlobals()
    })
  })

  // ========================================================================
  // Cache hit/miss behavior — demoData and initialData shapes
  // ========================================================================
  describe('cache hit/miss behavior', () => {
    it('passes demoData array to useCache for pods hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedPods } = await loadModule()
      useCachedPods()

      // demoData should be a non-empty array (demo pods)
      expect(Array.isArray(capturedOpts.demoData)).toBe(true)
      expect((capturedOpts.demoData as unknown[]).length).toBeGreaterThan(0)
    })

    it('passes empty array as initialData for list hooks', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      const { useCachedDeployments } = await loadModule()
      useCachedDeployments()

      expect(capturedOpts.initialData).toEqual([])
    })

    it('passes empty object as initialData for helm values hook', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult({})
      })

      const { useCachedHelmValues } = await loadModule()
      useCachedHelmValues('c1', 'rel', 'ns')

      expect(capturedOpts.initialData).toEqual({})
    })

    it('useCachedHelmReleases uses helm category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedHelmReleases } = await loadModule()
      useCachedHelmReleases()
      expect(mockUseCache.mock.calls[0][0].category).toBe('helm')
    })

    it('useCachedGPUNodes uses gpu category', async () => {
      mockUseCache.mockReturnValue(makeCacheResult([]))
      const { useCachedGPUNodes } = await loadModule()
      useCachedGPUNodes()
      expect(mockUseCache.mock.calls[0][0].category).toBe('gpu')
    })
  })

  // ========================================================================
  // Stale-while-revalidate pattern
  // ========================================================================
  describe('stale-while-revalidate pattern', () => {
    it('returns stale data while refreshing', async () => {
      const staleData = [{ name: 'stale-pod', status: 'Running' }]
      mockUseCache.mockReturnValue(
        makeCacheResult(staleData, {
          isRefreshing: true,
          isLoading: false,
          lastRefresh: Date.now() - 60_000,
        })
      )

      const { useCachedPods } = await loadModule()
      const result = useCachedPods()

      // Should have data even while refreshing (stale-while-revalidate)
      expect(result.pods).toEqual(staleData)
      expect(result.isRefreshing).toBe(true)
      expect(result.isLoading).toBe(false)
    })

    it('preserves lastRefresh timestamp from cache', async () => {
      const timestamp = Date.now() - 30_000
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: timestamp })
      )

      const { useCachedEvents } = await loadModule()
      const result = useCachedEvents()

      expect(result.lastRefresh).toBe(timestamp)
    })

    it('lastRefresh is null when no data has been fetched', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], { lastRefresh: null, isLoading: true })
      )

      const { useCachedNodes } = await loadModule()
      const result = useCachedNodes()

      expect(result.lastRefresh).toBeNull()
      expect(result.isLoading).toBe(true)
    })
  })

  // ========================================================================
  // Error recovery and consecutive failure tracking
  // ========================================================================
  describe('error recovery and consecutive failure tracking', () => {
    it('tracks consecutive failures count from cache', async () => {
      mockUseCache.mockReturnValue(
        makeCacheResult([], {
          consecutiveFailures: 5,
          isFailed: true,
          error: 'Network unreachable',
        })
      )

      const { useCachedDeployments } = await loadModule()
      const result = useCachedDeployments()

      expect(result.consecutiveFailures).toBe(5)
      expect(result.isFailed).toBe(true)
      expect(result.error).toBe('Network unreachable')
    })

    it('resets failure state on successful refetch', async () => {
      // First: failed state
      mockUseCache.mockReturnValue(
        makeCacheResult([], { consecutiveFailures: 3, isFailed: true })
      )

      const { useCachedPods } = await loadModule()
      const result1 = useCachedPods()
      expect(result1.consecutiveFailures).toBe(3)

      // Second: success state (simulating refetch)
      mockUseCache.mockReturnValue(
        makeCacheResult([{ name: 'pod-ok' }], { consecutiveFailures: 0, isFailed: false })
      )
      const result2 = useCachedPods()
      expect(result2.consecutiveFailures).toBe(0)
      expect(result2.isFailed).toBe(false)
    })

    it('useCachedPodIssues fetcher throws when no data source available', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      // No agent clusters
      vi.doMock('../mcp/shared', () => ({
        clusterCacheRef: { clusters: [] },
      }))

      const { useCachedPodIssues } = await loadModule()
      useCachedPodIssues()

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow()
    })

    it('useCachedDeploymentIssues fetcher throws when both sources unavailable', async () => {
      let capturedOpts: Record<string, unknown> = {}
      mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
        capturedOpts = opts
        return makeCacheResult([])
      })

      mockIsBackendUnavailable.mockReturnValue(true)
      mockIsAgentUnavailable.mockReturnValue(true)

      const { useCachedDeploymentIssues } = await loadModule()
      renderHook(() => useCachedDeploymentIssues())

      const fetcher = capturedOpts.fetcher as () => Promise<unknown>
      await expect(fetcher()).rejects.toThrow('No data source available')
    })
  })
})
