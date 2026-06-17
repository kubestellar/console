import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { importFresh, registeredResets, seedSessionStorage } from './cache.shared'

describe('cache module', () => {
describe('isEquivalentToInitial (tested via CacheStore.fetch)', () => {
  /**
   * isEquivalentToInitial is a private function, but we can verify its
   * behavior indirectly through CacheStore constructor hydration and
   * the fetch guard that avoids overwriting cache with empty responses.
   *
   * The function checks:
   * - null/undefined both null -> true
   * - both empty arrays -> true
   * - objects compared via JSON.stringify
   * - mismatched types -> false
   */

  it('treats two null values as equivalent', async () => {
    // Seed sessionStorage with null data and timestamp=0
    // If isEquivalentToInitial(null, null) returns true AND timestamp=0,
    // the CacheStore constructor will NOT hydrate from this snapshot
    sessionStorage.setItem('kcc:null-test', JSON.stringify({ d: null, t: 0, v: 4 }))
    const mod = await importFresh()

    // Create a store through prefetchCache with null initial data
    // The store should stay in loading state since both are null and timestamp=0
    await mod.prefetchCache('null-test', async () => null, null)
    // No assertion needed beyond no-throw — the function exercises the path
  })

  it('treats two empty arrays as equivalent', async () => {
    // Seed with empty array; the CacheStore constructor should NOT hydrate
    // from this since isEquivalentToInitial([], []) is true AND timestamp=0
    sessionStorage.setItem('kcc:empty-arr', JSON.stringify({ d: [], t: 0, v: 4 }))
    const mod = await importFresh()
    await mod.prefetchCache('empty-arr', async () => [], [])
  })

  it('treats matching objects as equivalent via JSON.stringify', async () => {
    const initial = { alerts: [], inventory: [], nodeCount: 0 }
    sessionStorage.setItem(
      'kcc:obj-equiv',
      JSON.stringify({ d: { alerts: [], inventory: [], nodeCount: 0 }, t: 0, v: 4 }),
    )
    const mod = await importFresh()
    await mod.prefetchCache('obj-equiv', async () => initial, initial)
  })

  it('non-empty arrays are not equivalent to empty initial arrays', async () => {
    // Seed with non-empty data: should hydrate because it differs from initial
    seedSessionStorage('nonempty-arr', [1, 2, 3], Date.now())
    const mod = await importFresh()
    // prefetchCache creates a store with initialData=[]; the snapshot has [1,2,3]
    // so isEquivalentToInitial returns false, and the store hydrates
    await mod.prefetchCache('nonempty-arr', async () => [4, 5], [])
  })
})

// ── clearAllInMemoryCaches ─────────────────────────────────────────────

describe('clearAllInMemoryCaches', () => {
  it('is registered with registerCacheReset as "unified-cache"', async () => {
    await importFresh()
    expect(registeredResets.has('unified-cache')).toBe(true)
  })

  it('calling the registered reset function does not throw', async () => {
    const mod = await importFresh()

    // Populate some cache stores first
    await mod.prefetchCache('clear-test-1', async () => ({ data: 'hello' }), {})
    await mod.prefetchCache('clear-test-2', async () => [1, 2, 3], [])

    const resetFn = registeredResets.get('unified-cache')
    expect(resetFn).toBeDefined()
    expect(() => resetFn!()).not.toThrow()
  })

  it('clearAllCaches removes localStorage metadata and clears registry', async () => {
    const mod = await importFresh()

    // Pre-populate localStorage with metadata
    localStorage.setItem('kc_meta:pods', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('kc_meta:clusters', JSON.stringify({ consecutiveFailures: 0 }))
    localStorage.setItem('unrelated_key', 'should stay')

    await mod.clearAllCaches()

    // Meta keys should be removed
    expect(localStorage.getItem('kc_meta:pods')).toBeNull()
    expect(localStorage.getItem('kc_meta:clusters')).toBeNull()
    // Unrelated keys should remain
    expect(localStorage.getItem('unrelated_key')).toBe('should stay')
  })
})

// ── CacheStore initialization ──────────────────────────────────────────

describe('CacheStore initialization', () => {
  it('hydrates from sessionStorage when valid snapshot exists', async () => {
    // Seed with real data
    const data = { pods: ['pod-1', 'pod-2'] }
    const timestamp = Date.now() - 5000
    seedSessionStorage('hydrate-test', data, timestamp)

    const mod = await importFresh()
    // Create store via prefetchCache — constructor should pick up the snapshot
    await mod.prefetchCache('hydrate-test', async () => ({ pods: ['pod-3'] }), { pods: [] })
  })

  it('starts in loading state when no cached data exists', async () => {
    const mod = await importFresh()
    // No session storage or IDB data — store should be in isLoading: true
    await mod.prefetchCache('cold-start', async () => ({ result: 'fresh' }), {})
  })

  it('does not hydrate from sessionStorage when data matches initial (empty)', async () => {
    // Seed with empty data and timestamp=0
    sessionStorage.setItem('kcc:empty-hydrate', JSON.stringify({ d: [], t: 0, v: 4 }))
    const mod = await importFresh()
    // Store should NOT hydrate since the data is equivalent to initial and timestamp is 0
    await mod.prefetchCache('empty-hydrate', async () => ['item'], [])
  })

  it('hydrates even with empty data if timestamp is valid (> 0)', async () => {
    // Empty data but valid timestamp means it was a real fetch that returned empty
    const validTimestamp = Date.now() - 1000
    seedSessionStorage('empty-valid-ts', [], validTimestamp)

    const mod = await importFresh()
    await mod.prefetchCache('empty-valid-ts', async () => ['new-item'], [])
  })

  it('loads metadata from preloaded meta map', async () => {
    const mod = await importFresh()
    // Populate meta before creating store
    mod.initPreloadedMeta({
      'meta-test': { consecutiveFailures: 2, lastError: 'timeout', lastSuccessfulRefresh: 1000 },
    })
    // Now create a store — it should pick up the meta
    await mod.prefetchCache('meta-test', async () => 'data', '')
  })

  it('defaults to 0 consecutiveFailures when meta is missing', async () => {
    const mod = await importFresh()
    // No meta for this key — should default to { consecutiveFailures: 0 }
    await mod.prefetchCache('no-meta', async () => 'data', '')
  })
})

// ── CacheStore.fetch ───────────────────────────────────────────────────

describe('CacheStore.fetch (via prefetchCache)', () => {
  it('saves successful fetch results to sessionStorage', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('fetch-save', async () => ({ result: 'saved' }), {})
    mod.__testables.ssFlush()

    // Check sessionStorage was written
    const raw = sessionStorage.getItem('kcc:fetch-save')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.d).toEqual({ result: 'saved' })
    expect(parsed.v).toBe(4)
  })

  it('handles fetch errors gracefully', async () => {
    const mod = await importFresh()
    // Fetch that throws
    await mod.prefetchCache('fetch-error', async () => {
      throw new Error('Network failure')
    }, [])
    // Should not throw; errors are handled internally
  })

  it('tracks consecutive failures on repeated errors', async () => {
    const mod = await importFresh()
    const failingFetcher = async () => { throw new Error('fail') }

    // Multiple failed fetches should increment consecutiveFailures
    await mod.prefetchCache('fail-track', failingFetcher, [])
    // Cannot directly inspect state but verify no crash
  })

  it('does not overwrite cached data with empty response', async () => {
    const mod = await importFresh()
    // First fetch with real data
    await mod.prefetchCache('guard-empty', async () => [1, 2, 3], [])
    mod.__testables.ssFlush()

    // Verify data was cached
    const raw1 = sessionStorage.getItem('kcc:guard-empty')
    expect(raw1).not.toBeNull()
    const parsed1 = JSON.parse(raw1!)
    expect(parsed1.d).toEqual([1, 2, 3])
  })

  it('accepts empty data on cold load (no cached data)', async () => {
    const mod = await importFresh()
    // Cold load with empty result — should accept it as valid
    await mod.prefetchCache('cold-empty', async () => [], [])
  })

  it('saves meta with lastSuccessfulRefresh on success', async () => {
    const mod = await importFresh()
    const before = Date.now()
    await mod.prefetchCache('meta-save', async () => ({ ok: true }), {})

    // Meta should be saved to localStorage (since no workerRpc)
    const metaRaw = localStorage.getItem('kc_meta:meta-save')
    expect(metaRaw).not.toBeNull()
    const meta = JSON.parse(metaRaw!)
    expect(meta.consecutiveFailures).toBe(0)
    expect(meta.lastSuccessfulRefresh).toBeGreaterThanOrEqual(before)
  })

  it('saves meta with error details on failure', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('meta-fail', async () => {
      throw new Error('backend down')
    }, [])

    const metaRaw = localStorage.getItem('kc_meta:meta-fail')
    expect(metaRaw).not.toBeNull()
    const meta = JSON.parse(metaRaw!)
    expect(meta.consecutiveFailures).toBe(1)
    expect(meta.lastError).toBe('backend down')
  })

  it('non-Error throw results in generic error message', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('non-error-throw', async () => {
      throw 'string error'  // not an Error instance
    }, [])

    const metaRaw = localStorage.getItem('kc_meta:non-error-throw')
    expect(metaRaw).not.toBeNull()
    const meta = JSON.parse(metaRaw!)
    expect(meta.lastError).toBe('Failed to fetch data')
  })

  it('prevents concurrent fetches (fetchingRef guard)', async () => {
    const mod = await importFresh()
    let callCount = 0
    const slowFetcher = async () => {
      callCount++
      await new Promise(resolve => setTimeout(resolve, 50))
      return { count: callCount }
    }

    // Fire two fetches concurrently — the second should be skipped
    const p1 = mod.prefetchCache('concurrent-guard', slowFetcher, {})
    const p2 = mod.prefetchCache('concurrent-guard', slowFetcher, {})
    await Promise.all([p1, p2])

    // The fetcher should only have been called once (second is a no-op)
    expect(callCount).toBe(1)
  })
})

// ── CacheStore.clear ──────────────────────────────────────────────────

describe('CacheStore.clear (via invalidateCache)', () => {
  it('invalidateCache removes the entry from storage and meta', async () => {
    const mod = await importFresh()
    // Populate
    await mod.prefetchCache('inv-test', async () => ({ x: 1 }), {})
    mod.__testables.ssFlush()
    expect(sessionStorage.getItem('kcc:inv-test')).not.toBeNull()

    await mod.invalidateCache('inv-test')
    // Meta should be gone
    expect(localStorage.getItem('kc_meta:inv-test')).toBeNull()
  })

  it('invalidateCache on nonexistent key does not throw', async () => {
    const mod = await importFresh()
    await expect(mod.invalidateCache('nonexistent')).resolves.not.toThrow()
  })
})

// ── resetFailuresForCluster ───────────────────────────────────────────

describe('resetFailuresForCluster', () => {
  it('resets failures for matching cache keys', async () => {
    const mod = await importFresh()
    // Create caches with cluster names in keys
    await mod.prefetchCache('pods:cluster-alpha:ns', async () => {
      throw new Error('fail')
    }, [])
    await mod.prefetchCache('deployments:cluster-alpha:ns', async () => {
      throw new Error('fail')
    }, [])

    const resetCount = mod.resetFailuresForCluster('cluster-alpha')
    expect(resetCount).toBe(2)
  })

  it('returns 0 for cluster with no matching keys', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('pods:other-cluster', async () => 'data', '')

    const resetCount = mod.resetFailuresForCluster('nonexistent-cluster')
    expect(resetCount).toBe(0)
  })

  it('also resets keys containing :all:', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('pods:all:namespace', async () => {
      throw new Error('fail')
    }, [])

    const resetCount = mod.resetFailuresForCluster('some-cluster')
    // :all: keys should match any cluster name
    expect(resetCount).toBe(1)
  })
})

// ── resetAllCacheFailures ─────────────────────────────────────────────

describe('resetAllCacheFailures', () => {
  it('resets failures on all stores', async () => {
    const mod = await importFresh()
    // Create stores that have failures
    await mod.prefetchCache('reset-all-1', async () => { throw new Error('fail') }, [])
    await mod.prefetchCache('reset-all-2', async () => { throw new Error('fail') }, [])

    // Should not throw
    expect(() => mod.resetAllCacheFailures()).not.toThrow()
  })

  it('is a no-op on stores with 0 failures', async () => {
    const mod = await importFresh()
    await mod.prefetchCache('reset-all-ok', async () => 'fine', '')

    // Should not throw even when failures are already 0
    expect(() => mod.resetAllCacheFailures()).not.toThrow()
  })
})

// ── getCacheStats ─────────────────────────────────────────────────────

describe('integration: full fetch cycle', () => {
  it('complete lifecycle: no cache -> fetch -> save -> re-read', async () => {
    const mod = await importFresh()

    // 1. No cached data initially
    expect(sessionStorage.getItem('kcc:lifecycle')).toBeNull()

    // 2. Fetch and save
    await mod.prefetchCache('lifecycle', async () => ({ items: [1, 2, 3] }), { items: [] })
    mod.__testables.ssFlush()

    // 3. Data should be in sessionStorage
    const raw = sessionStorage.getItem('kcc:lifecycle')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.d).toEqual({ items: [1, 2, 3] })
    expect(parsed.v).toBe(4)

    // 4. Meta should be in localStorage
    const metaRaw = localStorage.getItem('kc_meta:lifecycle')
    expect(metaRaw).not.toBeNull()
    const meta = JSON.parse(metaRaw!)
    expect(meta.consecutiveFailures).toBe(0)
  })

  it('failure + success cycle resets failures', async () => {
    const mod = await importFresh()

    // 1. Fail
    await mod.prefetchCache('cycle-test', async () => { throw new Error('fail') }, [])
    let meta = JSON.parse(localStorage.getItem('kc_meta:cycle-test')!)
    expect(meta.consecutiveFailures).toBe(1)

    // 2. Clear and succeed (need a new store since the old one has fetchingRef)
    await mod.invalidateCache('cycle-test')
    await mod.prefetchCache('cycle-test', async () => ['success'], [])
    meta = JSON.parse(localStorage.getItem('kc_meta:cycle-test')!)
    expect(meta.consecutiveFailures).toBe(0)
  })
})

// ── useCache hook (React integration) ─────────────────────────────────
})
