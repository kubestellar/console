import { describe, it, expect, vi } from 'vitest'

import {
  loadModule,
  makeCacheResult,
  mockUseCache,
  registerUseCachedDataTestHooks,
} from './useCachedData.fetchers.shared'

describe('useCachedData', () => {
  registerUseCachedDataTestHooks()

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

  // ========================================================================
  // Refetch / subscriber notifications
  // ========================================================================
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

  // ========================================================================
  // localStorage / token interactions
  // ========================================================================
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
  })

  // ========================================================================
  // Persist flag
  // ========================================================================
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
})
