import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useContourStatus } from './useContourStatus'
import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'

vi.mock('../../../lib/cache', () => ({
  useCache: vi.fn(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

const mockCacheReturn = (overrides: Record<string, unknown> = {}) => {
  ;(useCache as ReturnType<typeof vi.fn>).mockReturnValue({
    data: {
      health: 'healthy',
      contourPods: { ready: 2, total: 2 },
      envoyPods: { ready: 6, total: 6 },
      httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 },
      tlsEnabled: 0,
      lastCheckTime: new Date().toISOString(),
    },
    isLoading: false,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoFallback: false,
    ...overrides,
  })
}

describe('useContourStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useCardLoadingState as ReturnType<typeof vi.fn>).mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
  })

  it('returns healthy state when both Contour and Envoy pods are ready', () => {
    mockCacheReturn()
    const { result } = renderHook(() => useContourStatus())
    expect(result.current.data.health).toBe('healthy')
    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('returns error=true when isFailed and no pod data', () => {
    mockCacheReturn({
      isFailed: true,
      data: {
        // Initial data state: no pods found yet, health set to not-installed.
        // hasAnyData = false here because pod totals are both zero.
        health: 'not-installed',
        contourPods: { ready: 0, total: 0 },
        envoyPods: { ready: 0, total: 0 },
        httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 },
        tlsEnabled: 0,
        lastCheckTime: new Date().toISOString(),
      },
    })
    const { result } = renderHook(() => useContourStatus())
    expect(result.current.error).toBe(true)
  })

  it('passes isDemoFallback from cache to useCardLoadingState', () => {
    mockCacheReturn({ isDemoFallback: true })
    renderHook(() => useContourStatus())
    expect(useCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('hasAnyData is false when health is not-installed with zero pods', () => {
    mockCacheReturn({
      data: {
        health: 'not-installed',
        contourPods: { ready: 0, total: 0 },
        envoyPods: { ready: 0, total: 0 },
        httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 },
        tlsEnabled: 0,
        lastCheckTime: new Date().toISOString(),
      },
    })
    renderHook(() => useContourStatus())
    // not-installed with no pods → hasAnyData=false, card falls through to data.health check
    expect(useCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ hasAnyData: false }),
    )
  })
})

describe('fetchContourStatus pod detection logic (via useCache fetcher)', () => {
  beforeEach(() => vi.clearAllMocks())

  const buildFetcher = () => {
    let capturedFetcher: (() => Promise<unknown>) | undefined
    ;(useCache as ReturnType<typeof vi.fn>).mockImplementation((opts: { fetcher?: () => Promise<unknown> }) => {
      capturedFetcher = opts.fetcher
      return {
        data: { health: 'healthy', contourPods: { ready: 0, total: 0 }, envoyPods: { ready: 0, total: 0 }, httpProxies: { total: 0, valid: 0, invalid: 0, orphaned: 0 }, tlsEnabled: 0, lastCheckTime: '' },
        isLoading: false, isFailed: false, consecutiveFailures: 0, isDemoFallback: false,
      }
    })
    renderHook(() => useContourStatus())
    return capturedFetcher!
  }

  const mockFetch = (pods: unknown[]) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pods }),
    } as Response)
  }

  it('returns not-installed when no Contour or Envoy pods found', async () => {
    const fetcher = buildFetcher()
    mockFetch([{ name: 'nginx-abc', status: 'Running', labels: { app: 'nginx' } }])
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('detects Contour pods by app=contour label', async () => {
    const fetcher = buildFetcher()
    mockFetch([
      { name: 'contour-abc', namespace: 'projectcontour', status: 'Running', ready: '1/1', labels: { app: 'contour' } },
      { name: 'envoy-xyz', namespace: 'projectcontour', status: 'Running', ready: '1/1', labels: { app: 'envoy' } },
    ])
    const result = await fetcher() as { health: string; contourPods: { ready: number; total: number }; envoyPods: { ready: number; total: number } }
    expect(result.health).toBe('healthy')
    expect(result.contourPods).toEqual({ ready: 1, total: 1 })
    expect(result.envoyPods).toEqual({ ready: 1, total: 1 })
  })

  it('reports degraded when an Envoy pod is not ready', async () => {
    const fetcher = buildFetcher()
    mockFetch([
      { name: 'contour-1', status: 'Running', ready: '1/1', labels: { app: 'contour' } },
      { name: 'envoy-1', status: 'Running', ready: '1/1', labels: { app: 'envoy' } },
      { name: 'envoy-2', status: 'Pending', ready: '0/1', labels: { app: 'envoy' } },
    ])
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('degraded')
  })

  it('reports degraded when Contour controller exists but NO Envoy pods', async () => {
    const fetcher = buildFetcher()
    mockFetch([
      { name: 'contour-1', status: 'Running', ready: '1/1', labels: { app: 'contour' } },
    ])
    const result = await fetcher() as { health: string }
    // 0 === 0 would be true without the envoyPodList.length > 0 guard — this test
    // would have incorrectly returned 'healthy' before the fix.
    expect(result.health).toBe('degraded')
  })

  it('throws on non-ok fetch response', async () => {
    const fetcher = buildFetcher()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(fetcher()).rejects.toThrow('HTTP 503')
  })
})
