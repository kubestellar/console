import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  migrateFromLocalStorage,
  clearAllCaches,
  getCacheStats,
  invalidateCache,
  initPreloadedMeta,
  resetAllCacheFailures,
  resetFailuresForCluster,
  isSQLiteWorkerActive,
} = await import('../index')

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── migrateFromLocalStorage ──

describe('migrateFromLocalStorage', () => {
  it('migrates ksc_ prefixed keys to kc_ prefix', async () => {
    localStorage.setItem('ksc_theme', 'dark')
    localStorage.setItem('ksc_lang', 'en')

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_theme')).toBe('dark')
    expect(localStorage.getItem('kc_lang')).toBe('en')
    expect(localStorage.getItem('ksc_theme')).toBeNull()
    expect(localStorage.getItem('ksc_lang')).toBeNull()
  })

  it('migrates ksc- prefixed keys to kc- prefix', async () => {
    localStorage.setItem('ksc-dashboard', 'main')

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc-dashboard')).toBe('main')
    expect(localStorage.getItem('ksc-dashboard')).toBeNull()
  })

  it('does not overwrite existing kc_ keys', async () => {
    localStorage.setItem('ksc_theme', 'old-dark')
    localStorage.setItem('kc_theme', 'already-set')

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_theme')).toBe('already-set')
    expect(localStorage.getItem('ksc_theme')).toBeNull()
  })

  it('migrates kc_cache: prefixed entries to storage', async () => {
    localStorage.setItem(
      'kc_cache:pods',
      JSON.stringify({ data: [{ name: 'pod-1' }], timestamp: 1000 }),
    )

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_cache:pods')).toBeNull()
  })

  it('removes kc_cache: entries even when parse fails', async () => {
    localStorage.setItem('kc_cache:bad', 'not-json{{{')

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_cache:bad')).toBeNull()
  })

  it('removes kc_cache: entries with no data field', async () => {
    localStorage.setItem('kc_cache:empty', JSON.stringify({ timestamp: 100 }))

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kc_cache:empty')).toBeNull()
  })

  it('removes kubectl-history key', async () => {
    localStorage.setItem('kubectl-history', 'some-history')

    await migrateFromLocalStorage()

    expect(localStorage.getItem('kubectl-history')).toBeNull()
  })

  it('handles empty localStorage gracefully', async () => {
    await expect(migrateFromLocalStorage()).resolves.not.toThrow()
  })

  it('handles localStorage errors gracefully', async () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('access denied')
    })
    await expect(migrateFromLocalStorage()).resolves.not.toThrow()
  })
})

// ── clearAllCaches ──

describe('clearAllCaches', () => {
  it('clears metadata keys from localStorage', async () => {
    localStorage.setItem('kc_meta:pods', JSON.stringify({ consecutiveFailures: 2 }))
    localStorage.setItem('kc_meta:nodes', JSON.stringify({ consecutiveFailures: 1 }))
    localStorage.setItem('other-key', 'keep-me')

    await clearAllCaches()

    expect(localStorage.getItem('kc_meta:pods')).toBeNull()
    expect(localStorage.getItem('kc_meta:nodes')).toBeNull()
    expect(localStorage.getItem('other-key')).toBe('keep-me')
  })

  it('clears sessionStorage snapshots', async () => {
    sessionStorage.setItem('kcc:pods', 'data')
    sessionStorage.setItem('kcc:nodes', 'data')

    await clearAllCaches()

    expect(sessionStorage.getItem('kcc:pods')).toBeNull()
    expect(sessionStorage.getItem('kcc:nodes')).toBeNull()
  })

  it('handles empty storage gracefully', async () => {
    await expect(clearAllCaches()).resolves.not.toThrow()
  })
})

// ── getCacheStats ──

describe('getCacheStats', () => {
  it('returns stats with entries count', async () => {
    const stats = await getCacheStats()
    expect(stats).toHaveProperty('keys')
    expect(stats).toHaveProperty('count')
    expect(stats).toHaveProperty('entries')
    expect(typeof stats.entries).toBe('number')
  })
})

// ── invalidateCache ──

describe('invalidateCache', () => {
  it('does not throw for non-existent key', async () => {
    await expect(invalidateCache('nonexistent-key')).resolves.not.toThrow()
  })
})

// ── initPreloadedMeta ──

describe('initPreloadedMeta', () => {
  it('populates meta from input', () => {
    initPreloadedMeta({
      pods: { consecutiveFailures: 2, lastError: 'timeout', lastSuccessfulRefresh: 1000 },
      nodes: { consecutiveFailures: 0, lastSuccessfulRefresh: 2000 },
    })
  })

  it('handles empty meta', () => {
    expect(() => initPreloadedMeta({})).not.toThrow()
  })

  it('handles meta with missing optional fields', () => {
    initPreloadedMeta({
      test: { consecutiveFailures: 0 },
    })
  })
})

// ── resetAllCacheFailures ──

describe('resetAllCacheFailures', () => {
  it('does not throw when no caches registered', () => {
    expect(() => resetAllCacheFailures()).not.toThrow()
  })
})

// ── resetFailuresForCluster ──

describe('resetFailuresForCluster', () => {
  it('returns 0 when no caches match', () => {
    const count = resetFailuresForCluster('nonexistent-cluster')
    expect(count).toBe(0)
  })
})

// ── isSQLiteWorkerActive ──

describe('isSQLiteWorkerActive', () => {
  it('returns false when no worker initialized', () => {
    expect(isSQLiteWorkerActive()).toBe(false)
  })
})
