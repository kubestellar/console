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
