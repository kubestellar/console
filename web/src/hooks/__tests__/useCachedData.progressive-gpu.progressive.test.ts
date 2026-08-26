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
  describe('security issues progressive fetcher', () => {
      it('provides progressiveFetcher when no cluster', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        const { useCachedSecurityIssues } = await loadModule()
        useCachedSecurityIssues()

        expect(capturedOpts.progressiveFetcher).toBeTypeOf('function')
      })

      it('omits progressiveFetcher when cluster specified', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        const { useCachedSecurityIssues } = await loadModule()
        useCachedSecurityIssues('prod')

        expect(capturedOpts.progressiveFetcher).toBeUndefined()
      })

      it('progressive fetcher: uses kubectl then falls back to SSE', async () => {
        let capturedOpts: Record<string, unknown> = {}
        mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
          capturedOpts = opts
          return makeCacheResult([])
        })

        mockClusterCacheRef.clusters = [] as typeof mockClusterCacheRef.clusters
        mockIsAgentUnavailable.mockReturnValue(true)

        mockFetchSSE.mockResolvedValue([{ name: 'sec-sse', issue: 'Priv', severity: 'high' }])

        const { useCachedSecurityIssues } = await loadModule()
        useCachedSecurityIssues()

        const progressiveFetcher = capturedOpts.progressiveFetcher as (onProgress: (p: unknown[]) => void) => Promise<unknown[]>
        const result = await progressiveFetcher(vi.fn())
        expect(result).toHaveLength(1)
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
})
