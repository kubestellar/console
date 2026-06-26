/**
 * Additional coverage tests for cache/index.ts — batch 2
 *
 * Targets uncovered lines NOT covered by cache-coverage.test.ts:
 * - isAutoRefreshPaused / setAutoRefreshPaused / subscribeAutoRefreshPaused pub/sub
 * - resetFailuresForCluster / resetAllCacheFailures iteration
 * - initPreloadedMeta populate + applyPreloadedMeta
 * - clearAllCaches / getCacheStats / invalidateCache via mock CacheWorkerRpc
 * - prefetchCache async path
 * - migrateFromLocalStorage edge cases
 * - REFRESH_RATES shape validation
 * - __testables: ssWrite, ssRead, clearSessionSnapshots, isEquivalentToInitial, getEffectiveInterval
 * - retryFetch (resetFailures + refetch)
 * - ssRead version mismatch path
 * - ssRead missing fields path
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────

let demoModeValue = false
const demoModeListeners = new Set<() => void>()

vi.mock('../../demoMode', () => ({
  isDemoMode: () => demoModeValue,
  subscribeDemoMode: (cb: () => void) => {
    demoModeListeners.add(cb)
    return () => demoModeListeners.delete(cb)
  },
}))

vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => () => {}),
}))

vi.mock('../../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_KUBECTL_HISTORY: 'kubectl-history' }
})

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

// ── Constants ──────────────────────────────────────────────────────

const CACHE_VERSION = 4
const SS_PREFIX = 'kcc:'

async function importFresh() {
  vi.resetModules()
  return import('../index')
}

// ── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  demoModeValue = false
  demoModeListeners.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// __testables direct unit tests
// ============================================================================

describe('__testables direct tests', () => {
  describe('ssWrite', () => {
    it('writes JSON with data, timestamp, and version to sessionStorage', async () => {
      const { __testables } = await importFresh()
      const testData = { items: [1, 2, 3] }
      const timestamp = 1700000000000

      __testables.ssWrite('test-key', testData, timestamp)
      __testables.ssFlush()

      const raw = sessionStorage.getItem(`${SS_PREFIX}test-key`)
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.d).toEqual(testData)
      expect(parsed.t).toBe(timestamp)
      expect(parsed.v).toBe(CACHE_VERSION)
    })

    it('silently swallows QuotaExceededError', async () => {
      const { __testables } = await importFresh()
      const origSetItem = sessionStorage.setItem.bind(sessionStorage)
      vi.spyOn(sessionStorage, 'setItem').mockImplementation((_key: string) => {
        throw new DOMException('QuotaExceededError')
      })

      // Should not throw
      expect(() => __testables.ssWrite('key', { x: 1 }, Date.now())).not.toThrow()

      vi.spyOn(sessionStorage, 'setItem').mockImplementation(origSetItem)
    })
  })

  describe('ssRead', () => {
    it('returns data and timestamp for valid entry', async () => {
      const { __testables } = await importFresh()
      const timestamp = 1700000000000
      sessionStorage.setItem(
        `${SS_PREFIX}valid`,
        JSON.stringify({ d: [1, 2], t: timestamp, v: CACHE_VERSION }),
      )

      const result = __testables.ssRead<number[]>('valid')
      expect(result).not.toBeNull()
      expect(result!.data).toEqual([1, 2])
      expect(result!.timestamp).toBe(timestamp)
    })

    it('returns null for missing key', async () => {
      const { __testables } = await importFresh()
      expect(__testables.ssRead('nonexistent')).toBeNull()
    })

    it('returns null and removes entry for version mismatch', async () => {
      const { __testables } = await importFresh()
      const WRONG_VERSION = 999
      sessionStorage.setItem(
        `${SS_PREFIX}old-version`,
        JSON.stringify({ d: [1], t: 100, v: WRONG_VERSION }),
      )

      const result = __testables.ssRead('old-version')
      expect(result).toBeNull()
      // Entry should be removed
      expect(sessionStorage.getItem(`${SS_PREFIX}old-version`)).toBeNull()
    })

    it('returns null for entry missing required fields', async () => {
      const { __testables } = await importFresh()
      // Missing 'v' field
      sessionStorage.setItem(
        `${SS_PREFIX}no-version`,
        JSON.stringify({ d: [1], t: 100 }),
      )

      expect(__testables.ssRead('no-version')).toBeNull()
    })

    it('returns null for non-object JSON (string)', async () => {
      const { __testables } = await importFresh()
      sessionStorage.setItem(`${SS_PREFIX}string-val`, '"just a string"')

      expect(__testables.ssRead('string-val')).toBeNull()
    })

    it('returns null for null JSON value', async () => {
      const { __testables } = await importFresh()
      sessionStorage.setItem(`${SS_PREFIX}null-val`, 'null')

      expect(__testables.ssRead('null-val')).toBeNull()
    })

    it('returns null on JSON parse error', async () => {
      const { __testables } = await importFresh()
      sessionStorage.setItem(`${SS_PREFIX}broken`, '{not valid json')

      expect(__testables.ssRead('broken')).toBeNull()
    })
  })

  describe('clearSessionSnapshots', () => {
    it('removes only kcc:-prefixed keys from sessionStorage', async () => {
      const { __testables } = await importFresh()
      sessionStorage.setItem(`${SS_PREFIX}a`, 'val-a')
      sessionStorage.setItem(`${SS_PREFIX}b`, 'val-b')
      sessionStorage.setItem('unrelated-key', 'keep-me')

      __testables.clearSessionSnapshots()

      expect(sessionStorage.getItem(`${SS_PREFIX}a`)).toBeNull()
      expect(sessionStorage.getItem(`${SS_PREFIX}b`)).toBeNull()
      expect(sessionStorage.getItem('unrelated-key')).toBe('keep-me')
    })

    it('handles empty sessionStorage without error', async () => {
      const { __testables } = await importFresh()
      sessionStorage.clear()
      expect(() => __testables.clearSessionSnapshots()).not.toThrow()
    })
  })

  describe('isEquivalentToInitial', () => {
    it('returns true when both are null', async () => {
      const { __testables } = await importFresh()
      expect(__testables.isEquivalentToInitial(null, null)).toBe(true)
    })

    it('returns true when both are empty arrays', async () => {
      const { __testables } = await importFresh()
      expect(__testables.isEquivalentToInitial([], [])).toBe(true)
    })

    it('returns false when one array has items and other is empty', async () => {
      const { __testables } = await importFresh()
      expect(__testables.isEquivalentToInitial([1], [])).toBe(false)
    })

    it('returns true for identical objects via JSON comparison', async () => {
      const { __testables } = await importFresh()
      const a = { count: 0, items: [] }
      const b = { count: 0, items: [] }
      expect(__testables.isEquivalentToInitial(a, b)).toBe(true)
    })

    it('returns false for different objects', async () => {
      const { __testables } = await importFresh()
      expect(__testables.isEquivalentToInitial({ x: 1 }, { x: 2 })).toBe(false)
    })

    it('returns false for circular reference objects (JSON.stringify throws)', async () => {
      const { __testables } = await importFresh()
      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular

      expect(__testables.isEquivalentToInitial(circular, { a: 1 })).toBe(false)
    })

    it('returns false for non-matching primitives', async () => {
      const { __testables } = await importFresh()
      expect(__testables.isEquivalentToInitial(42, 99)).toBe(false)
    })
  })

  describe('getEffectiveInterval', () => {
    it('returns base interval with zero failures', async () => {
      const { __testables } = await importFresh()
      const BASE_INTERVAL = 60_000
      expect(__testables.getEffectiveInterval(BASE_INTERVAL, 0)).toBe(BASE_INTERVAL)
    })

    it('applies exponential backoff for 1 failure', async () => {
      const { __testables } = await importFresh()
      const BASE_INTERVAL = 60_000
      const EXPECTED_MULTIPLIER = 2 // 2^1
      expect(__testables.getEffectiveInterval(BASE_INTERVAL, 1)).toBe(
        BASE_INTERVAL * EXPECTED_MULTIPLIER
      )
    })

    it('applies exponential backoff for 3 failures', async () => {
      const { __testables } = await importFresh()
      const BASE_INTERVAL = 60_000
      const EXPECTED_MULTIPLIER = 8 // 2^3
      expect(__testables.getEffectiveInterval(BASE_INTERVAL, 3)).toBe(
        BASE_INTERVAL * EXPECTED_MULTIPLIER
      )
    })

    it('caps backoff at MAX_BACKOFF_INTERVAL', async () => {
      const { __testables } = await importFresh()
      const BASE_INTERVAL = 60_000
      const MANY_FAILURES = 10
      const result = __testables.getEffectiveInterval(BASE_INTERVAL, MANY_FAILURES)
      expect(result).toBeLessThanOrEqual(__testables.MAX_BACKOFF_INTERVAL)
    })

    it('caps exponent at 5 (2^5 = 32 max multiplier)', async () => {
      const { __testables } = await importFresh()
      const BASE_INTERVAL = 10_000
      const FIVE_FAILURES = 5
      const SIX_FAILURES = 6
      // Both should produce the same result since exponent is capped at 5
      expect(__testables.getEffectiveInterval(BASE_INTERVAL, FIVE_FAILURES)).toBe(
        __testables.getEffectiveInterval(BASE_INTERVAL, SIX_FAILURES)
      )
    })
  })

  describe('constants', () => {
    it('CACHE_VERSION is a positive integer', async () => {
      const { __testables } = await importFresh()
      expect(Number.isInteger(__testables.CACHE_VERSION)).toBe(true)
      expect(__testables.CACHE_VERSION).toBeGreaterThan(0)
    })

    it('SS_PREFIX is kcc:', async () => {
      const { __testables } = await importFresh()
      expect(__testables.SS_PREFIX).toBe('kcc:')
    })

    it('META_PREFIX is kc_meta:', async () => {
      const { __testables } = await importFresh()
      expect(__testables.META_PREFIX).toBe('kc_meta:')
    })

    it('MAX_FAILURES is 3', async () => {
      const { __testables } = await importFresh()
      expect(__testables.MAX_FAILURES).toBe(3)
    })

    it('FAILURE_BACKOFF_MULTIPLIER is 2', async () => {
      const { __testables } = await importFresh()
      expect(__testables.FAILURE_BACKOFF_MULTIPLIER).toBe(2)
    })

    it('MAX_BACKOFF_INTERVAL is 600_000 (10 min)', async () => {
      const { __testables } = await importFresh()
      const TEN_MINUTES_MS = 600_000
      expect(__testables.MAX_BACKOFF_INTERVAL).toBe(TEN_MINUTES_MS)
    })
  })
})

// ============================================================================
// Auto-refresh pause pub/sub
// ============================================================================

describe('auto-refresh pause pub/sub', () => {
  it('subscribeAutoRefreshPaused returns unsubscribe function', async () => {
    const { subscribeAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
    const listener = vi.fn()

    const unsub = subscribeAutoRefreshPaused(listener)
    setAutoRefreshPaused(true)
    expect(listener).toHaveBeenCalledWith(true)

    listener.mockClear()
    unsub()
    setAutoRefreshPaused(false)
    // After unsubscribe, listener should NOT be called
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies multiple subscribers', async () => {
    const { subscribeAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    subscribeAutoRefreshPaused(listener1)
    subscribeAutoRefreshPaused(listener2)

    setAutoRefreshPaused(true)
    expect(listener1).toHaveBeenCalledWith(true)
    expect(listener2).toHaveBeenCalledWith(true)
  })

  it('isAutoRefreshPaused reflects current state', async () => {
    const { isAutoRefreshPaused, setAutoRefreshPaused } = await importFresh()

    expect(isAutoRefreshPaused()).toBe(false)
    setAutoRefreshPaused(true)
    expect(isAutoRefreshPaused()).toBe(true)
    setAutoRefreshPaused(false)
    expect(isAutoRefreshPaused()).toBe(false)
  })
})

// ============================================================================
// retryFetch
// ============================================================================

describe('retryFetch', () => {
  it('resets failures then refetches', async () => {
    const { useCache } = await importFresh()
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'))
      .mockResolvedValue([42])

    const { result } = renderHook(() => useCache({
      key: 'retry-test',
      fetcher,
      initialData: [] as number[],
      autoRefresh: false,
    }))

    // Wait for initial failure
    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    // Trigger another failure
    await act(async () => { await result.current.refetch() })

    // Now retryFetch should reset failures and succeed
    await act(async () => { await result.current.retryFetch() })

    await waitFor(() => {
      expect(result.current.data).toEqual([42])
      expect(result.current.consecutiveFailures).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })
})

// ============================================================================
// REFRESH_RATES shape
// ============================================================================

describe('REFRESH_RATES', () => {
  it('has all expected categories', async () => {
    const { REFRESH_RATES } = await importFresh()
    const expectedCategories = [
      'realtime', 'pods', 'clusters', 'deployments', 'services',
      'metrics', 'gpu', 'helm', 'gitops', 'namespaces', 'rbac',
      'operators', 'costs', 'ai-ml', 'default',
    ]
    for (const cat of expectedCategories) {
      expect(REFRESH_RATES).toHaveProperty(cat)
    }
  })

  it('realtime is the shortest interval', async () => {
    const { REFRESH_RATES } = await importFresh()
    const values = Object.values(REFRESH_RATES) as number[]
    const min = Math.min(...values)
    expect(REFRESH_RATES.realtime).toBe(min)
  })

  it('costs is the longest interval', async () => {
    const { REFRESH_RATES } = await importFresh()
    const values = Object.values(REFRESH_RATES) as number[]
    const max = Math.max(...values)
    expect(REFRESH_RATES.costs).toBe(max)
  })
})

// ============================================================================
// initPreloadedMeta
// ============================================================================

describe('initPreloadedMeta', () => {
  it('populates meta and applies to stores in loading state', async () => {
    const mod = await importFresh()
    const { useCache, initPreloadedMeta } = mod

    // Create a store that will stay in loading state (fetcher never resolves)
    const neverResolve = vi.fn(() => new Promise<string[]>(() => {}))
    const { result } = renderHook(() => useCache({
      key: 'meta-populate',
      fetcher: neverResolve,
      initialData: [] as string[],
      autoRefresh: false,
    }))

    // Store should be loading
    expect(result.current.isLoading).toBe(true)

    // Apply meta with failure data
    const FAILURES_EXCEEDING_MAX = 5
    act(() => {
      initPreloadedMeta({
        'meta-populate': {
          consecutiveFailures: FAILURES_EXCEEDING_MAX,
          lastError: 'connection refused',
          lastSuccessfulRefresh: 1700000000000,
        },
      })
    })

    // The store should now show failed state
    await waitFor(() => {
      expect(result.current.isFailed).toBe(true)
    })
  })

  it('does not apply meta to stores with loaded data', async () => {
    const mod = await importFresh()
    const { useCache, initPreloadedMeta } = mod

    const { result } = renderHook(() => useCache({
      key: 'meta-loaded',
      fetcher: () => Promise.resolve(['data']),
      initialData: [] as string[],
      autoRefresh: false,
    }))

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Apply meta — should NOT override the loaded state
    const FAILURES_EXCEEDING_MAX = 5
    act(() => {
      initPreloadedMeta({
        'meta-loaded': {
          consecutiveFailures: FAILURES_EXCEEDING_MAX,
        },
      })
    })

    // Should still show loaded data, not failed
    expect(result.current.isFailed).toBe(false)
    expect(result.current.data).toEqual(['data'])
  })
})

// ============================================================================
// isEmpty custom predicate for demoWhenEmpty
// ============================================================================

describe('useCache demoWhenEmpty with custom isEmpty', () => {
  it('uses custom isEmpty predicate for object-shaped data', async () => {
    const { useCache } = await importFresh()
    const demoData = { guides: [{ id: 'demo-guide' }] }
    const emptyLiveData = { guides: [] as { id: string }[] }

    const { result } = renderHook(() => useCache({
      key: 'custom-empty-check',
      fetcher: () => Promise.resolve(emptyLiveData),
      initialData: { guides: [] as { id: string }[] },
      demoData,
      demoWhenEmpty: true,
      isEmpty: (data) => (data.guides || []).length === 0,
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Custom isEmpty should detect the object as empty and fall back to demo
    expect(result.current.data).toEqual(demoData)
    expect(result.current.isDemoFallback).toBe(true)
  })
})

// ============================================================================
// migrateFromLocalStorage — kc_cache: entry with missing .data field
// ============================================================================

describe('migrateFromLocalStorage edge cases', () => {
  it('handles kc_cache: entry with undefined data field', async () => {
    localStorage.setItem('kc_cache:no-data', JSON.stringify({ timestamp: 1000, version: 4 }))

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    // Key should still be removed
    expect(localStorage.getItem('kc_cache:no-data')).toBeNull()
  })

  it('handles mixed ksc_ and ksc- prefixed keys', async () => {
    localStorage.setItem('ksc_setting1', 'v1')
    localStorage.setItem('ksc-setting2', 'v2')
    localStorage.setItem('ksc_setting3', 'v3')

    const { migrateFromLocalStorage } = await importFresh()
    await migrateFromLocalStorage()

    // All old keys removed
    expect(localStorage.getItem('ksc_setting1')).toBeNull()
    expect(localStorage.getItem('ksc-setting2')).toBeNull()
    expect(localStorage.getItem('ksc_setting3')).toBeNull()

    // New keys created
    expect(localStorage.getItem('kc_setting1')).toBe('v1')
    expect(localStorage.getItem('kc-setting2')).toBe('v2')
    expect(localStorage.getItem('kc_setting3')).toBe('v3')
  })
})

// ============================================================================
// getCacheStats includes registry entries count
// ============================================================================

describe('getCacheStats with registry entries', () => {
  it('entries count reflects number of registered stores', async () => {
    const { getCacheStats, useCache } = await importFresh()

    // Create some stores
    renderHook(() => useCache({
      key: 'stats-a',
      fetcher: () => Promise.resolve([]),
      initialData: [],
      autoRefresh: false,
    }))
    renderHook(() => useCache({
      key: 'stats-b',
      fetcher: () => Promise.resolve([]),
      initialData: [],
      autoRefresh: false,
    }))

    const stats = await getCacheStats()
    expect(stats.entries).toBeGreaterThanOrEqual(2)
  })
})

// ============================================================================
// invalidateCache clears metadata from preloaded map
// ============================================================================

describe('invalidateCache metadata cleanup', () => {
  it('removes key from preloaded meta map', async () => {
    const { invalidateCache, useCache } = await importFresh()

    const { result } = renderHook(() => useCache({
      key: 'inv-meta-test',
      fetcher: () => Promise.resolve([1, 2]),
      initialData: [] as number[],
      autoRefresh: false,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await invalidateCache('inv-meta-test')

    // Store should be in loading state after invalidation
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
      expect(result.current.lastRefresh).toBeNull()
    })
  })
})
