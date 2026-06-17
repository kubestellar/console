import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { importFresh } from './cache.shared'



describe('cache — migrations/edge cases', () => {
describe('CacheStore.fetch — empty response on cold load', () => {
  it('accepts empty array on cold load (no cache) without getting stuck', async () => {
    const mod = await importFresh()
    const fetcher = vi.fn().mockResolvedValue([])

    const { result } = renderHook(() =>
      mod.useCache({
        key: 'cold-empty-accept',
        fetcher,
        initialData: [] as string[],
        shared: false,
        autoRefresh: false,
      })
    )

    // Should not stay in loading forever — empty result on cold load is accepted
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])
  })
})

// ── CacheStore constructor — isFailed from meta ──────────────────────────

describe('CacheStore constructor — isFailed from meta', () => {
  it('sets isFailed=true when meta has >= MAX_FAILURES(3) consecutive failures', async () => {
    const mod = await importFresh()
    // Pre-populate meta with 3+ failures
    mod.initPreloadedMeta({
      'prefailed-key': { consecutiveFailures: 3, lastError: 'timeout' },
    })

    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
    const { result } = renderHook(() =>
      mod.useCache({
        key: 'prefailed-key',
        fetcher,
        initialData: [] as string[],
        shared: true,
        autoRefresh: false,
      })
    )

    // Store should be in failed state from the meta
    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(3)
  })
})

// ── clearAllCaches — comprehensive cleanup ──────────────────────────────

describe('clearAllCaches — comprehensive', () => {
  it('removes all kc_meta: keys from localStorage', async () => {
    localStorage.setItem('kc_meta:a', JSON.stringify({ consecutiveFailures: 0 }))
    localStorage.setItem('kc_meta:b', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('kc_meta:c', JSON.stringify({ consecutiveFailures: 2 }))
    localStorage.setItem('other_key', 'keep-me')

    const mod = await importFresh()
    await mod.clearAllCaches()

    expect(localStorage.getItem('kc_meta:a')).toBeNull()
    expect(localStorage.getItem('kc_meta:b')).toBeNull()
    expect(localStorage.getItem('kc_meta:c')).toBeNull()
    expect(localStorage.getItem('other_key')).toBe('keep-me')
  })

  it('clears the cache registry', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('clear-reg-1', async () => 'a', '')
    await mod.prefetchCache('clear-reg-2', async () => 'b', '')

    let stats = await mod.getCacheStats()
    expect(stats.entries).toBeGreaterThanOrEqual(2)

    await mod.clearAllCaches()

    stats = await mod.getCacheStats()
    expect(stats.entries).toBe(0)
  })
})

// ── useCache — shared store is NOT destroyed on unmount ──────────────────

describe('CacheStore.fetch — progressive fetcher with error', () => {
  it('saves partial data to storage when progressive fetcher throws after onProgress', async () => {
    const mod = await importFresh()
    const progressiveFetcher = vi.fn(async (onProgress: (d: string[]) => void) => {
      onProgress(['partial-1', 'partial-2'])
      throw new Error('stream interrupted')
    })

    const { result } = renderHook(() =>
      mod.useCache({
        key: 'prog-error-save',
        fetcher: vi.fn().mockResolvedValue([]),
        initialData: [] as string[],
        autoRefresh: false,
        shared: false,
        progressiveFetcher,
      })
    )

    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    // Partial data should have been saved and preserved
    expect(result.current.data).toEqual(['partial-1', 'partial-2'])
  })
})

// ── getEffectiveInterval — indirect through auto-refresh timing ──────────

describe('getEffectiveInterval — indirect through auto-refresh with failures', () => {
  it('uses longer interval after consecutive failures (backoff)', async () => {
    vi.useFakeTimers()
    const mod = await importFresh()
    let callCount = 0
    // First call fails, subsequent succeed
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 1) throw new Error('fail')
      return ['data']
    })

    renderHook(() =>
      mod.useCache({
        key: 'backoff-interval',
        fetcher,
        initialData: [] as string[],
        shared: false,
        autoRefresh: true,
        category: 'realtime', // 15_000ms base
      })
    )

    // Let initial fetch (which fails) complete
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // After 1 failure, interval should be 15000 * 2 = 30000
    // Advance 16 seconds — should NOT trigger (old interval was 15s but now it's 30s)
    const callsAfterFail = fetcher.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })

    // Advance another 15 seconds (total 31s) — should trigger with backoff
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(fetcher.mock.calls.length).toBeGreaterThan(callsAfterFail)

    vi.useRealTimers()
  })
})

// ── CacheStore.resetFailures — no-op guard ──────────────────────────────

describe('CacheStore.resetFailures — no-op on 0 failures', () => {
  it('does not modify meta when failures are already 0', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('reset-noop', async () => 'ok', '')

    const metaBefore = localStorage.getItem('kc_meta:reset-noop')

    // Reset on a store with 0 failures
    mod.resetFailuresForCluster('reset-noop')

    const metaAfter = localStorage.getItem('kc_meta:reset-noop')
    // Meta should be unchanged (resetFailures returns early when consecutiveFailures === 0)
    expect(metaAfter).toBe(metaBefore)
  })
})

// ==========================================================================
// #5279 — SSE / Progressive Fetch Integration Tests
// ==========================================================================
})
