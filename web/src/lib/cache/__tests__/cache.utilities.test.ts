import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module under test
vi.mock('../../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
  subscribeDemoMode: vi.fn(() => vi.fn()),
}))

vi.mock('../../modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(),
}))

vi.mock('../workerRpc', () => ({
  CacheWorkerRpc: vi.fn(),
}))

vi.mock('../../constants', () => ({
  STORAGE_KEY_KUBECTL_HISTORY: 'kc-kubectl-history',
}))

vi.mock('../../../hooks/useKeepAliveActive', () => ({
  useKeepAliveActive: vi.fn(() => true),
}))

import {
  REFRESH_RATES,
  isAutoRefreshPaused,
  setAutoRefreshPaused,
  subscribeAutoRefreshPaused,
  isSQLiteWorkerActive,
  initPreloadedMeta,
  clearAllCaches,
  getCacheStats,
  invalidateCache,
  resetFailuresForCluster,
  resetAllCacheFailures,
  migrateFromLocalStorage,
  preloadCacheFromStorage,
} from '../index'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setAutoRefreshPaused(false)
})

describe('REFRESH_RATES', () => {
  it('has expected categories with valid intervals', () => {
    expect(REFRESH_RATES.realtime).toBe(15_000)
    expect(REFRESH_RATES.pods).toBe(30_000)
    expect(REFRESH_RATES.clusters).toBe(60_000)
    expect(REFRESH_RATES.deployments).toBe(60_000)
    expect(REFRESH_RATES.services).toBe(60_000)
    expect(REFRESH_RATES.metrics).toBe(45_000)
    expect(REFRESH_RATES.gpu).toBe(45_000)
    expect(REFRESH_RATES.helm).toBe(120_000)
    expect(REFRESH_RATES.gitops).toBe(120_000)
    expect(REFRESH_RATES.namespaces).toBe(180_000)
    expect(REFRESH_RATES.rbac).toBe(300_000)
    expect(REFRESH_RATES.operators).toBe(300_000)
    expect(REFRESH_RATES.costs).toBe(600_000)
    expect(REFRESH_RATES['ai-ml']).toBe(60_000)
    expect(REFRESH_RATES.default).toBe(120_000)
  })

  it('all values are positive numbers', () => {
    for (const [, value] of Object.entries(REFRESH_RATES)) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThan(0)
    }
  })
})

describe('auto-refresh pause', () => {
  it('defaults to not paused', () => {
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('can be paused and resumed', () => {
    setAutoRefreshPaused(true)
    expect(isAutoRefreshPaused()).toBe(true)
    setAutoRefreshPaused(false)
    expect(isAutoRefreshPaused()).toBe(false)
  })

  it('does not notify when value unchanged', () => {
    const cb = vi.fn()
    subscribeAutoRefreshPaused(cb)
    setAutoRefreshPaused(false)
    expect(cb).not.toHaveBeenCalled()
  })

  it('notifies subscribers on change', () => {
    const cb = vi.fn()
    subscribeAutoRefreshPaused(cb)
    setAutoRefreshPaused(true)
    expect(cb).toHaveBeenCalledWith(true)
    setAutoRefreshPaused(false)
    expect(cb).toHaveBeenCalledWith(false)
  })

  it('unsubscribe stops notifications', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeAutoRefreshPaused(cb)
    unsubscribe()
    setAutoRefreshPaused(true)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('isSQLiteWorkerActive', () => {
  it('returns false when no worker is initialized', () => {
    expect(isSQLiteWorkerActive()).toBe(false)
  })
})

describe('initPreloadedMeta', () => {
  it('populates preloaded metadata from worker data', () => {
    initPreloadedMeta({
      'test-key': {
        consecutiveFailures: 3,
        lastError: 'timeout',
        lastSuccessfulRefresh: 1000,
      },
    })
    // The metadata is internal — verify it doesn't throw
    expect(() => initPreloadedMeta({})).not.toThrow()
  })

  it('clears previous metadata on re-init', () => {
    initPreloadedMeta({ key1: { consecutiveFailures: 1 } })
    initPreloadedMeta({ key2: { consecutiveFailures: 2 } })
    // No throw = success
  })
})

describe('clearAllCaches', () => {
  it('clears localStorage metadata keys', async () => {
    localStorage.setItem('kc_meta:pods', JSON.stringify({ consecutiveFailures: 0 }))
    localStorage.setItem('kc_meta:clusters', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('unrelated-key', 'keep')
    await clearAllCaches()
    expect(localStorage.getItem('kc_meta:pods')).toBeNull()
    expect(localStorage.getItem('kc_meta:clusters')).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
  })

  it('clears sessionStorage snapshots', async () => {
    sessionStorage.setItem('kcc:pods', JSON.stringify({ d: [], t: 0, v: 4 }))
    sessionStorage.setItem('other-key', 'keep')
    await clearAllCaches()
    expect(sessionStorage.getItem('kcc:pods')).toBeNull()
    expect(sessionStorage.getItem('other-key')).toBe('keep')
  })
})

describe('getCacheStats', () => {
  it('returns stats object with expected shape', async () => {
    const stats = await getCacheStats()
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
    expect(stats).toHaveProperty('entries')
    expect(Array.isArray(stats.keys)).toBe(true)
    expect(typeof stats.count).toBe('number')
    expect(typeof stats.entries).toBe('number')
  })
})

describe('invalidateCache', () => {
  it('does not throw for non-existent key', async () => {
    await expect(invalidateCache('non-existent-key')).resolves.not.toThrow()
  })
})

describe('resetFailuresForCluster', () => {
  it('returns 0 when no caches match', () => {
    const count = resetFailuresForCluster('non-existent-cluster')
    expect(count).toBe(0)
  })
})

describe('resetAllCacheFailures', () => {
  it('does not throw when no caches exist', () => {
    expect(() => resetAllCacheFailures()).not.toThrow()
  })
})

describe('migrateFromLocalStorage', () => {
  it('migrates ksc_ prefixed keys to kc_', async () => {
    localStorage.setItem('ksc_test_key', 'test_value')
    await migrateFromLocalStorage()
    expect(localStorage.getItem('ksc_test_key')).toBeNull()
    expect(localStorage.getItem('kc_test_key')).toBe('test_value')
  })

  it('migrates ksc- prefixed keys to kc-', async () => {
    localStorage.setItem('ksc-another-key', 'value2')
    await migrateFromLocalStorage()
    expect(localStorage.getItem('ksc-another-key')).toBeNull()
    expect(localStorage.getItem('kc-another-key')).toBe('value2')
  })

  it('does not overwrite existing kc_ keys during migration', async () => {
    localStorage.setItem('ksc_existing', 'old')
    localStorage.setItem('kc_existing', 'new')
    await migrateFromLocalStorage()
    expect(localStorage.getItem('kc_existing')).toBe('new')
  })

  it('cleans up old kc_cache: prefixed entries', async () => {
    localStorage.setItem('kc_cache:pods', JSON.stringify({ data: [1, 2, 3] }))
    await migrateFromLocalStorage()
    expect(localStorage.getItem('kc_cache:pods')).toBeNull()
  })

  it('removes kubectl history key', async () => {
    localStorage.setItem('kc-kubectl-history', 'some history')
    await migrateFromLocalStorage()
    expect(localStorage.getItem('kc-kubectl-history')).toBeNull()
  })

  it('handles corrupt JSON in cache entries gracefully', async () => {
    localStorage.setItem('kc_cache:broken', '{invalid')
    await expect(migrateFromLocalStorage()).resolves.not.toThrow()
    expect(localStorage.getItem('kc_cache:broken')).toBeNull()
  })
})

describe('preloadCacheFromStorage', () => {
  it('does not throw when storage is empty', async () => {
    await expect(preloadCacheFromStorage()).resolves.not.toThrow()
  })
})
