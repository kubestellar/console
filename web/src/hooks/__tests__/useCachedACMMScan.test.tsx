/**
 * Branch-coverage tests for useCachedACMMScan.
 *
 * Exercises the demoScan generator, fetchACMMScan happy/error paths,
 * forceRefetch flag-flip semantics, and the derived level+recommendations.
 * useCache is mocked to short-circuit the caching layer so the hook's own
 * logic is what's under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock useCache — the hook delegates all fetching/caching to it. We mock it
// to surface the passed-in `demoData` / `initialData` / `fetcher` so tests
// can verify they were constructed correctly.
// ---------------------------------------------------------------------------

const lastArgs: { current: Record<string, unknown> | null } = { current: null }

vi.mock('../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => {
    lastArgs.current = args
    return {
      data: args.demoData,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
      refetch: vi.fn(),
    }
  },
  REFRESH_RATES: { costs: 600_000, default: 120_000 },
}))

import { useCachedACMMScan } from '../useCachedACMMScan'

describe('useCachedACMMScan', () => {
  beforeEach(() => {
    lastArgs.current = null
    globalThis.fetch = vi.fn() as typeof globalThis.fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    // Call the fetcher directly to verify the force flag makes it to the URL.
    const fetcher = lastArgs.current?.fetcher as () => Promise<unknown>
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString()
      return {
        ok: true,
        status: 200,
        json: async () => ({ repo: 'x/y', scannedAt: '', detectedIds: [], weeklyActivity: [], _url: url }),
      } as Response
    }) as typeof globalThis.fetch

    await act(async () => { await result.current.forceRefetch() })
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
})
