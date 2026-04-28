/**
 * Branch-coverage tests for useCachedACMMScan.
 *
 * Exercises the demoScan generator, fetchACMMScan happy/error paths,
 * forceRefetch flag-flip semantics, and the derived level+recommendations.
 * useCache is mocked to short-circuit the caching layer so the hook's own
 * logic is what's under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock useCache — the hook delegates all fetching/caching to it. We mock it
// to surface the passed-in `demoData` / `initialData` / `fetcher` so tests
// can verify they were constructed correctly.
// ---------------------------------------------------------------------------

const lastArgs: { current: Record<string, unknown> | null } = { current: null }
// Capture the last `refetch` mock handed to the hook so tests can assert
// `forceRefetch()` actually calls through to it.
const lastRefetch: { current: ReturnType<typeof vi.fn> | null } = { current: null }

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => {
    lastArgs.current = args
    const refetch = vi.fn()
    lastRefetch.current = refetch
    return {
      data: args.demoData,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch,
    }
  },
  REFRESH_RATES: { costs: 600_000, default: 120_000 },
}))

import { useCachedACMMScan } from '../useCachedACMMScan'

describe('useCachedACMMScan', () => {
  // Capture the real fetch once so `afterEach` can restore it — otherwise a
  // reassigned `globalThis.fetch` from one test would leak into later files.
  const ORIGINAL_FETCH = globalThis.fetch

  beforeEach(() => {
    lastArgs.current = null
    lastRefetch.current = null
    globalThis.fetch = vi.fn() as typeof globalThis.fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('uses the default repo when none is provided', () => {
    renderHook(() => useCachedACMMScan())
    expect(lastArgs.current?.key).toBe('acmm:scan:kubestellar/console')
  })

  it('accepts a custom repo and uses it in the cache key + initial data', () => {
    renderHook(() => useCachedACMMScan('microsoft/drasi'))
    expect(lastArgs.current?.key).toBe('acmm:scan:microsoft/drasi')
    const demo = lastArgs.current?.demoData as { repo: string; weeklyActivity: Array<unknown> }
    expect(demo.repo).toBe('microsoft/drasi')
  })

  it('demoScan generates 16 weekly activity buckets with non-negative counts', () => {
    renderHook(() => useCachedACMMScan('x/y'))
    const demo = lastArgs.current?.demoData as {
      weeklyActivity: Array<{ week: string; aiPrs: number; humanPrs: number; aiIssues: number; humanIssues: number }>
    }
    expect(demo.weeklyActivity.length).toBe(16)
    for (const wk of demo.weeklyActivity) {
      expect(wk.week).toMatch(/^\d{4}-W\d{2}$/)
      expect(wk.aiPrs).toBeGreaterThanOrEqual(0)
      expect(wk.humanPrs).toBeGreaterThanOrEqual(0)
      expect(wk.aiIssues).toBeGreaterThanOrEqual(0)
      expect(wk.humanIssues).toBeGreaterThanOrEqual(0)
    }
  })

  it('demoScan seeds a realistic detectedIds list that covers multiple sources', () => {
    renderHook(() => useCachedACMMScan('x/y'))
    const demo = lastArgs.current?.demoData as { detectedIds: string[] }
    expect(demo.detectedIds.length).toBeGreaterThan(10)
    // Should span ACMM + supplementary source prefixes.
    expect(demo.detectedIds.some(id => id.startsWith('acmm:'))).toBe(true)
    expect(demo.detectedIds.some(id => id.startsWith('fullsend:'))).toBe(true)
  })

  it('computes level + recommendations from detected IDs', () => {
    const { result } = renderHook(() => useCachedACMMScan('x/y'))
    expect(result.current.level).toBeDefined()
    expect(result.current.level.level).toBeGreaterThan(0)
    expect(Array.isArray(result.current.recommendations)).toBe(true)
  })

  it('detectedIds is a Set, not an array', () => {
    const { result } = renderHook(() => useCachedACMMScan('x/y'))
    expect(result.current.detectedIds).toBeInstanceOf(Set)
  })

  it('isDemoData is false when useCache reports no demo fallback', () => {
    const { result } = renderHook(() => useCachedACMMScan('x/y'))
    expect(result.current.isDemoData).toBe(false)
  })

  it('forceRefetch flips the force flag and calls refetch', async () => {
    const { result } = renderHook(() => useCachedACMMScan('x/y'))
    // Capture the mocked refetch that the hook received from useCache — we
    // assert it gets invoked by forceRefetch() below.
    const refetchMock = lastRefetch.current
    expect(refetchMock).not.toBeNull()
    // Call the fetcher directly to verify the force flag makes it to the URL.
    const fetcher = lastArgs.current?.fetcher as () => Promise<unknown>
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString()
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ repo: 'x/y', scannedAt: '', detectedIds: [], weeklyActivity: [], _url: url }),
      } as Response
    }) as typeof globalThis.fetch

    await act(async () => { await result.current.forceRefetch() })
    // forceRefetch must delegate to the underlying cache.refetch — that's
    // the "calls refetch" half of this test's contract.
    expect(refetchMock).toHaveBeenCalledTimes(1)
    // Directly invoke the fetcher after forceRefetch — forceNextRef was set
    // to true in forceRefetch, so this first call should include &force=true.
    await act(async () => { await fetcher() })
    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      c => (typeof c[0] === 'string' ? c[0] : String(c[0])),
    )
    expect(urls.some(u => u.includes('force=true'))).toBe(true)
  })

  it('fetcher bubbles a non-2xx response as an Error', async () => {
    renderHook(() => useCachedACMMScan('x/y'))
    const fetcher = lastArgs.current?.fetcher as () => Promise<unknown>
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 503, statusText: 'Service Unavailable',
      json: async () => ({}),
    }) as Response) as typeof globalThis.fetch
    await expect(fetcher()).rejects.toThrow(/503/)
  })

  // Regression test for kubestellar/consoleIssue 8848:
  // When the Netlify Function can't reach GitHub (missing token, rate limit,
  // network failure, etc.) it returns HTTP 200 with `demoFallback: true` and
  // a plausible demo catalog. Before the fix, the hook threw that flag away
  // and reported `isDemoData: false`, so the user saw the demo catalog of
  // kubestellar/console as if it were a real scan. The fix routes the flag
  // through a per-repo store that useSyncExternalStore picks up on re-render.
  it('flips isDemoData to true when the server returns demoFallback:true', async () => {
    // Isolate the module graph so the per-repo demoFallback store starts
    // fresh for this test — stale state from other tests in the same file
    // would otherwise pre-flip the flag and mask a real regression.
    vi.resetModules()
    const REPO = 'demo-fallback-test/repo'
    const { useCachedACMMScan: freshHook } = await import('../useCachedACMMScan')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        repo: REPO,
        scannedAt: new Date().toISOString(),
        detectedIds: ['acmm:claude-md'],
        weeklyActivity: [],
        demoFallback: true,
        error: 'GitHub token not configured',
      }),
    }) as Response) as typeof globalThis.fetch
    const { result } = renderHook(() => freshHook(REPO))
    const fetcher = lastArgs.current?.fetcher as () => Promise<unknown>
    await act(async () => { await fetcher() })
    expect(result.current.isDemoData).toBe(true)
  })

  it('leaves isDemoData false on a clean live response (no demoFallback flag)', async () => {
    vi.resetModules()
    const REPO = 'clean-live/repo'
    const { useCachedACMMScan: freshHook } = await import('../useCachedACMMScan')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        repo: REPO,
        scannedAt: new Date().toISOString(),
        detectedIds: ['acmm:claude-md'],
        weeklyActivity: [],
      }),
    }) as Response) as typeof globalThis.fetch
    const { result } = renderHook(() => freshHook(REPO))
    const fetcher = lastArgs.current?.fetcher as () => Promise<unknown>
    await act(async () => { await fetcher() })
    expect(result.current.isDemoData).toBe(false)
  })
})
