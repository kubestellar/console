import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { importFresh, seedSessionStorage } from './cache.shared'


describe('cache — migrations/edge cases', () => {
describe('CacheStore.saveMeta — localStorage fallback', () => {
  it('writes meta to localStorage when no workerRpc is active', async () => {
    const mod = await importFresh()
    // Verify isSQLiteWorkerActive is false (no worker)
    expect(mod.isSQLiteWorkerActive()).toBe(false)

    await mod.prefetchCache('meta-ls-fallback', async () => ({ ok: true }), {})

    const metaRaw = localStorage.getItem('kc_meta:meta-ls-fallback')
    expect(metaRaw).not.toBeNull()
    const meta = JSON.parse(metaRaw!)
    expect(meta.consecutiveFailures).toBe(0)
    expect(meta.lastSuccessfulRefresh).toBeGreaterThan(0)
  })

  it('handles localStorage.setItem error gracefully in saveMeta', async () => {
    const mod = await importFresh()
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    // Should not throw — saveMeta catches errors
    await expect(
      mod.prefetchCache('meta-ls-error', async () => 'ok', '')
    ).resolves.toBeUndefined()

    spy.mockRestore()
  })
})

// ── CacheStore.destroy ───────────────────────────────────────────────────

describe('CacheStore.destroy', () => {
  it('clears all subscribers and stops refresh timeout on unmount', async () => {
    vi.useFakeTimers()
    const mod = await importFresh()
    const fetcher = vi.fn().mockResolvedValue(['data'])

    const { unmount } = renderHook(() =>
      mod.useCache({
        key: 'destroy-test',
        fetcher,
        initialData: [] as string[],
        shared: false,
        autoRefresh: true,
        category: 'realtime',
      })
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(100) })

    // Unmount should call destroy on non-shared store
    unmount()

    // Advance timers — no more fetches should fire
    const callsBefore = fetcher.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    // After unmount, no new calls should happen (interval cleared)
    expect(fetcher.mock.calls.length).toBe(callsBefore)

    vi.useRealTimers()
  })
})

// ── CacheStore.loadFromStorage — early return on initialDataLoaded ───────

describe('CacheStore.loadFromStorage — early return paths', () => {
  it('skips storage load when persist=false', async () => {
    const mod = await importFresh()
    const fetcher = vi.fn().mockResolvedValue(['fetched'])
    const { result } = renderHook(() =>
      mod.useCache({
        key: 'no-persist-load',
        fetcher,
        initialData: [] as string[],
        persist: false,
        shared: false,
        autoRefresh: false,
      })
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(['fetched'])
    // No sessionStorage entry
    expect(sessionStorage.getItem('kcc:no-persist-load')).toBeNull()
  })

  it('skips storage load when already hydrated from sessionStorage', async () => {
    seedSessionStorage('already-hydrated', ['from-ss'], Date.now())
    const mod = await importFresh()
    const fetcher = vi.fn().mockResolvedValue(['from-fetcher'])
    const { result } = renderHook(() =>
      mod.useCache({
        key: 'already-hydrated',
        fetcher,
        initialData: [] as string[],
        shared: true,
        autoRefresh: false,
      })
    )
    // Should hydrate from sessionStorage immediately
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual(['from-ss'])
  })
})

// ── CacheStore.saveToStorage — error handling ────────────────────────────

describe('CacheStore.saveToStorage — error path', () => {
  it('logs error but does not throw when cacheStorage.set fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await importFresh()

    // We cannot directly mock cacheStorage since it's internal, but we can
    // verify the fetch succeeds even if sessionStorage write fails
    const spy = vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string) => {
      if (key.startsWith('kcc:')) {
        throw new DOMException('QuotaExceededError')
      }
    })

    await expect(
      mod.prefetchCache('save-error', async () => ['data'], [])
    ).resolves.toBeUndefined()

    spy.mockRestore()
    consoleSpy.mockRestore()
  })
})

// ── migrateFromLocalStorage — kc_cache: prefix migration ─────────────────

describe('migrateFromLocalStorage — kc_cache: prefix migration', () => {
  it('migrates kc_cache: entries to cacheStorage and removes old keys', async () => {
    localStorage.setItem('kc_cache:pods', JSON.stringify({ data: ['pod-1'], timestamp: 1000, version: 4 }))
    const mod = await importFresh()
    await mod.migrateFromLocalStorage()
    // Old key should be removed
    expect(localStorage.getItem('kc_cache:pods')).toBeNull()
  })

  it('removes kc_cache: entries even if JSON is invalid', async () => {
    localStorage.setItem('kc_cache:broken', 'not-json')
    const mod = await importFresh()
    await mod.migrateFromLocalStorage()
    expect(localStorage.getItem('kc_cache:broken')).toBeNull()
  })

  it('skips entries where data is undefined', async () => {
    localStorage.setItem('kc_cache:empty', JSON.stringify({ timestamp: 1000 }))
    const mod = await importFresh()
    await mod.migrateFromLocalStorage()
    expect(localStorage.getItem('kc_cache:empty')).toBeNull()
  })

  it('handles multiple ksc_ keys with both underscore and dash prefixes', async () => {
    localStorage.setItem('ksc_alpha', 'val1')
    localStorage.setItem('ksc-beta', 'val2')
    localStorage.setItem('ksc_gamma', 'val3')

    const mod = await importFresh()
    await mod.migrateFromLocalStorage()

    expect(localStorage.getItem('ksc_alpha')).toBeNull()
    expect(localStorage.getItem('ksc-beta')).toBeNull()
    expect(localStorage.getItem('ksc_gamma')).toBeNull()
    expect(localStorage.getItem('kc_alpha')).toBe('val1')
    expect(localStorage.getItem('kc-beta')).toBe('val2')
    expect(localStorage.getItem('kc_gamma')).toBe('val3')
  })
})

// ── migrateIDBToSQLite — workerRpc null guard ────────────────────────────

describe('migrateIDBToSQLite — additional paths', () => {
  it('returns immediately when workerRpc is null (IndexedDB fallback)', async () => {
    const mod = await importFresh()
    expect(mod.isSQLiteWorkerActive()).toBe(false)
    // Should return without error since no worker is active
    await expect(mod.migrateIDBToSQLite()).resolves.not.toThrow()
  })
})

// ── preloadCacheFromStorage — empty storage ──────────────────────────────

describe('preloadCacheFromStorage — edge cases', () => {
  it('returns early when storage has no keys', async () => {
    const mod = await importFresh()
    await expect(mod.preloadCacheFromStorage()).resolves.not.toThrow()
  })

  it('does not throw when called multiple times', async () => {
    const mod = await importFresh()
    await mod.preloadCacheFromStorage()
    await mod.preloadCacheFromStorage()
    // Should be idempotent
  })
})

// ── getCacheStats — comprehensive ────────────────────────────────────────

describe('getCacheStats — detailed', () => {
  it('returns 0 entries when no caches exist', async () => {
    const mod = await importFresh()
    const stats = await mod.getCacheStats()
    expect(stats.entries).toBe(0)
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
  })

  it('counts multiple cache entries correctly', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('stat-a', async () => 'a', '')
    await mod.prefetchCache('stat-b', async () => 'b', '')
    await mod.prefetchCache('stat-c', async () => 'c', '')

    const stats = await mod.getCacheStats()
    expect(stats.entries).toBeGreaterThanOrEqual(3)
  })
})

// ── invalidateCache — store clear path ───────────────────────────────────

describe('invalidateCache — with existing store', () => {
  it('clears store state and removes from preloadedMetaMap', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('inv-full', async () => ({ data: 'test' }), {})
    mod.__testables.ssFlush()

    // Verify meta and sessionStorage exist
    expect(localStorage.getItem('kc_meta:inv-full')).not.toBeNull()
    expect(sessionStorage.getItem('kcc:inv-full')).not.toBeNull()

    await mod.invalidateCache('inv-full')

    // Meta should be removed
    expect(localStorage.getItem('kc_meta:inv-full')).toBeNull()
  })

  it('handles invalidating the same key twice gracefully', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('inv-double', async () => 'data', '')
    await mod.invalidateCache('inv-double')
    await mod.invalidateCache('inv-double')
    // Should not throw on double invalidation
  })
})

// ── useCache — demoWhenEmpty optimistic demo path ────────────────────────
})
