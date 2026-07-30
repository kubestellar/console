import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Controllable demo-mode mock
// ---------------------------------------------------------------------------

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

function setDemoMode(val: boolean) {
  demoModeValue = val
  demoModeListeners.forEach(fn => fn())
}

vi.mock('../../demoMode', () => ({
  isDemoMode: () => demoModeValue,
  subscribeDemoMode: (cb: () => void) => {
    demoModeListeners.add(cb)
    return () => demoModeListeners.delete(cb)
  },
}))

const registeredResets = new Map<string, () => void | Promise<void>>()
const registeredRefetches = new Map<string, () => void | Promise<void>>()

vi.mock('../../modeTransition', () => ({
  registerCacheReset: (key: string, fn: () => void | Promise<void>) => { registeredResets.set(key, fn) },
  registerRefetch: (key: string, fn: () => void | Promise<void>) => {
    registeredRefetches.set(key, fn)
    return () => registeredRefetches.delete(key)
  },
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_KUBECTL_HISTORY: 'kubectl-history' }
})

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Offset (ms) to make seeded cache data older than any refresh interval,
 *  ensuring the initial fetch is NOT skipped by the fresh-data guard (#7653). */
const STALE_AGE_MS = 600_000

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

/**
 * Seed sessionStorage with a valid cache entry (CACHE_VERSION = 4).
 * The key will be stored as "kcc:<cacheKey>" to match the SS_PREFIX constant.
 */
function seedSessionStorage(cacheKey: string, data: unknown, timestamp: number): void {
  const CACHE_VERSION = 4
  sessionStorage.setItem(
    `kcc:${cacheKey}`,
    JSON.stringify({ d: data, t: timestamp, v: CACHE_VERSION }),
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  demoModeValue = false
  demoModeListeners.clear()
  registeredResets.clear()
  registeredRefetches.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cache — migrations/edge cases', () => {
  describe('progressive fetch — chunked data delivery (#5279)', () => {
    it('progressiveFetcher delivers partial data before final result', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const CHUNK_DELAY_MS = 50
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        // Simulate first cluster responding
        onProgress(['cluster-1-pods'])
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
        // Simulate second cluster responding
        onProgress(['cluster-1-pods', 'cluster-2-pods'])
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
        // Final result with all clusters
        return ['cluster-1-pods', 'cluster-2-pods', 'cluster-3-pods']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-chunked-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['cluster-1-pods', 'cluster-2-pods', 'cluster-3-pods'])
      expect(progressiveFetcher).toHaveBeenCalledTimes(1)
    })

    it('progressive fetcher with many chunks does not overwhelm renders (throttling)', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const TOTAL_CLUSTERS = 50
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        const accumulated: string[] = []
        // Simulate 50 clusters responding rapidly
        for (let i = 0; i < TOTAL_CLUSTERS; i++) {
          accumulated.push(`cluster-${i}`)
          onProgress([...accumulated])
        }
        return accumulated
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-many-chunks-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Final data should contain all clusters
      expect(result.current.data).toHaveLength(TOTAL_CLUSTERS)
      expect(result.current.data[0]).toBe('cluster-0')
      expect(result.current.data[TOTAL_CLUSTERS - 1]).toBe(`cluster-${TOTAL_CLUSTERS - 1}`)
    })

    it('progressive fetcher error after partial data preserves partial results', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      const PROGRESS_DELAY_MS = 150  // Exceed the PROGRESS_THROTTLE_MS (100ms) to ensure flush
      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        onProgress(['cluster-1'])
        // Wait beyond the throttle window so both calls are flushed
        await new Promise(r => setTimeout(r, PROGRESS_DELAY_MS))
        onProgress(['cluster-1', 'cluster-2'])
        await new Promise(r => setTimeout(r, PROGRESS_DELAY_MS))
        throw new Error('SSE connection lost after 2 clusters')
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-partial-error-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      // Wait for the fetch cycle to complete (error will be caught)
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Partial data from onProgress should be preserved even though the fetcher threw.
      // When hasData is true (from onProgress), the error is still recorded
      // but data is not wiped.
      expect(result.current.data).toEqual(['cluster-1', 'cluster-2'])
      expect(result.current.error).not.toBeNull()
    })

    it('progressive fetch ignores empty progress updates to protect cached data', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      // Seed cache with existing data
      seedSessionStorage('sse-empty-guard-1', ['cached-data'], Date.now() - STALE_AGE_MS)

      const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
        // Push an empty array (should be ignored by isEquivalentToInitial guard)
        onProgress([])
        return ['final-data']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'sse-empty-guard-1',
          fetcher: vi.fn(),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
          progressiveFetcher,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Final data should be the fetcher result, not the empty progress update
      expect(result.current.data).toEqual(['final-data'])
    })
  })

  // ==========================================================================
  // #5280 — LocalStorage / SessionStorage Corruption Fallbacks
  // ==========================================================================

  describe('storage corruption fallbacks (#5280)', () => {
    it('handles corrupt JSON in sessionStorage without crashing', async () => {
      sessionStorage.setItem('kcc:corrupt-json-1', '{definitely not valid JSON!@#$')
      const mod = await importFresh()

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'corrupt-json-1',
          fetcher: vi.fn().mockResolvedValue(['fresh']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Should fall back to initialData and fetch fresh data
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['fresh'])
    })

    it('handles corrupt meta JSON in localStorage without crashing', async () => {
      // Corrupt the metadata entry
      localStorage.setItem('kc_meta:corrupt-meta-1', '!!!bad{json')

      const mod = await importFresh()
      // initPreloadedMeta should handle gracefully (meta is loaded from preloadedMetaMap)
      // The localStorage meta is only a fallback — if it's corrupt, default to 0 failures
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'corrupt-meta-1',
          fetcher: vi.fn().mockResolvedValue(['ok']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.consecutiveFailures).toBe(0)
    })

    it('handles sessionStorage entry with truncated JSON', async () => {
      // Simulate truncated write (e.g., browser killed during write)
      sessionStorage.setItem('kcc:truncated-1', '{"d":[1,2,3],"t":170000')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'truncated-1',
          fetcher: vi.fn().mockResolvedValue(['recovered']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['recovered'])
    })

    it('handles sessionStorage entry with wrong data shape (missing d/t/v)', async () => {
      // Valid JSON but wrong shape
      sessionStorage.setItem('kcc:wrong-shape-1', JSON.stringify({ foo: 'bar', baz: 42 }))

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'wrong-shape-1',
          fetcher: vi.fn().mockResolvedValue(['correct']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['correct'])
    })

    it('handles sessionStorage entry that is a bare string', async () => {
      sessionStorage.setItem('kcc:bare-string-1', '"just a string"')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'bare-string-1',
          fetcher: vi.fn().mockResolvedValue(['ok']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(['ok'])
    })

    it('handles sessionStorage entry that is a bare number', async () => {
      sessionStorage.setItem('kcc:bare-number-1', '99999')

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'bare-number-1',
          fetcher: vi.fn().mockResolvedValue([42]),
          initialData: [] as number[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([42])
    })

    it('handles sessionStorage entry with version mismatch gracefully', async () => {
      const STALE_VERSION = 1
      sessionStorage.setItem('kcc:old-version-1', JSON.stringify({
        d: ['stale-data'],
        t: Date.now(),
        v: STALE_VERSION,
      }))

      const mod = await importFresh()
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'old-version-1',
          fetcher: vi.fn().mockResolvedValue(['current']),
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      // Stale version data should be ignored, fresh fetch used instead
      expect(result.current.data).toEqual(['current'])
    })
  })

  // ==========================================================================
  // #5281 — Concurrent Failure Retries: isFailed after 3+ failures
  // ==========================================================================

  describe('concurrent failure retries — isFailed transition (#5281)', () => {
    it('transitions to isFailed=true after MAX_FAILURES (3) consecutive errors', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const MAX_FAILURES = 3
      const fetcher = vi.fn().mockRejectedValue(new Error('connection refused'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-transition-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Wait for initial fetch failure
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

      // Trigger additional failures
      for (let i = 1; i < MAX_FAILURES; i++) {
        await act(async () => { await result.current.refetch() })
      }

      // After 3 consecutive failures, isFailed should be true
      expect(result.current.isFailed).toBe(true)
      expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(MAX_FAILURES)
      // isLoading should be false since we hit isFailed (card shows error state)
      expect(result.current.isLoading).toBe(false)
    })

    it('isFailed=false with only 1-2 consecutive failures', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const fetcher = vi.fn().mockRejectedValue(new Error('timeout'))

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-partial-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      expect(result.current.isFailed).toBe(false)
      // isLoading should still be true (still retrying)
      expect(result.current.isLoading).toBe(true)
    })

    it('isFailed resets to false after a successful fetch', async () => {
      setDemoMode(false)
      const mod = await importFresh()
      const MAX_FAILURES = 3
      let callNum = 0
      const fetcher = vi.fn().mockImplementation(async () => {
        callNum++
        if (callNum <= MAX_FAILURES) throw new Error(`fail ${callNum}`)
        return ['recovered']
      })

      const { result } = renderHook(() =>
        mod.useCache({
          key: 'fail-recover-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      // Drive failures
      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      for (let i = 1; i < MAX_FAILURES; i++) {
        await act(async () => { await result.current.refetch() })
      }
      expect(result.current.isFailed).toBe(true)

      // Now succeed
      await act(async () => { await result.current.refetch() })
      expect(result.current.isFailed).toBe(false)
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.data).toEqual(['recovered'])
    })

    it('meta persists consecutive failure count across store operations', async () => {
      setDemoMode(false)
      const mod = await importFresh()

      // Two consecutive failures
      const fetcher = vi.fn().mockRejectedValue(new Error('fail'))
      const { result } = renderHook(() =>
        mod.useCache({
          key: 'meta-fail-persist-1',
          fetcher,
          initialData: [] as string[],
          autoRefresh: false,
          shared: false,
        })
      )

      await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))
      await act(async () => { await result.current.refetch() })

      // Meta should reflect 2 failures
      const metaRaw = localStorage.getItem('kc_meta:meta-fail-persist-1')
      expect(metaRaw).not.toBeNull()
      const meta = JSON.parse(metaRaw!)
      expect(meta.consecutiveFailures).toBe(2)
      expect(meta.lastError).toBe('fail')
    })
  })
})
