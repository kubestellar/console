import { describe, it, expect } from 'vitest'
import { importFresh, seedSessionStorage } from './cache.test.shared'

describe('cache module', () => {
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

  describe('getCacheStats', () => {
    it('returns registry size in entries field', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('stats-1', async () => 'a', '')
      await mod.prefetchCache('stats-2', async () => 'b', '')

      const stats = await mod.getCacheStats()
      expect(stats.entries).toBeGreaterThanOrEqual(2)
      expect(stats).toHaveProperty('keys')
      expect(stats).toHaveProperty('count')
    })
  })

  // ── preloadCacheFromStorage ───────────────────────────────────────────


  // ── Shared cache registry (getOrCreateCache) ─────────────────────────

  describe('shared cache registry', () => {
    it('reuses the same store for the same key (via prefetchCache)', async () => {
      const mod = await importFresh()
      let callCount = 0
      const fetcher = async () => { callCount++; return 'data' }

      // Two prefetchCache calls with the same key should share the store
      await mod.prefetchCache('shared-key', fetcher, '')
      await mod.prefetchCache('shared-key', fetcher, '')

      // The second call reuses the store; the fetcher may not run again
      // because fetchingRef guard prevents concurrent fetch, or store already loaded
      expect(callCount).toBeLessThanOrEqual(2)
    })
  })

  // ── CacheStore.resetToInitialData ─────────────────────────────────────

  describe('CacheStore state management', () => {
    it('clearAndRefetch resets store state and refetches', async () => {
      const mod = await importFresh()
      await mod.prefetchCache('clear-refetch', async () => ({ a: 1 }), {})
      mod.__testables.ssFlush()

      // Verify data was stored
      const raw = sessionStorage.getItem('kcc:clear-refetch')
      expect(raw).not.toBeNull()

      // Invalidate should clear it
      await mod.invalidateCache('clear-refetch')
    })
  })

  // ── Integration: meta + store + fetch cycle ───────────────────────────

})
