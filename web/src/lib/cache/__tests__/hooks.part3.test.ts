import { describe, it, expect, vi } from 'vitest'
import { importHooks } from './hooks.setup'

describe('getStorageStats', () => {
  it('returns localStorage stats for stored keys', async () => {
    localStorage.setItem('key1', 'value1')
    localStorage.setItem('key2', 'longer-value-here')

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.localStorage.count).toBe(2)
    // used = sum of (key.length + value.length) * 2 for UTF-16
    const UTF16_MULTIPLIER = 2
    const expectedBytes = ('key1'.length + 'value1'.length + 'key2'.length + 'longer-value-here'.length) * UTF16_MULTIPLIER
    expect(stats.localStorage.used).toBe(expectedBytes)
  })

  it('returns zero stats when localStorage is empty', async () => {
    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.localStorage.count).toBe(0)
    expect(stats.localStorage.used).toBe(0)
  })

  it('returns indexedDB stats when navigator.storage.estimate is available', async () => {
    const MOCK_USAGE = 1024
    const MOCK_QUOTA = 1048576
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({ usage: MOCK_USAGE, quota: MOCK_QUOTA }),
      },
      writable: true,
      configurable: true,
    })

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.indexedDB).toEqual({ used: MOCK_USAGE, quota: MOCK_QUOTA })
  })

  it('returns null indexedDB stats when navigator.storage is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { getStorageStats } = await importHooks()
    const stats = await getStorageStats()

    expect(stats.indexedDB).toBeNull()
  })
})

// ===========================================================================
// clearAllStorage
// ===========================================================================

describe('clearAllStorage', () => {
  it('removes kubestellar- prefixed keys from localStorage', async () => {
    localStorage.setItem('kubestellar-pref:sort', '"name"')
    localStorage.setItem('kubestellar-setting', 'true')
    localStorage.setItem('unrelated-key', 'keep')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('kubestellar-pref:sort')).toBeNull()
    expect(localStorage.getItem('kubestellar-setting')).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
  })

  it('removes kc_ prefixed keys from localStorage', async () => {
    localStorage.setItem('kc_cache_meta', 'data')
    localStorage.setItem('other', 'keep')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('kc_cache_meta')).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
  })

  it('removes ksc_ prefixed keys from localStorage', async () => {
    localStorage.setItem('ksc_settings', 'data')

    const { clearAllStorage } = await importHooks()
    await clearAllStorage()

    expect(localStorage.getItem('ksc_settings')).toBeNull()
  })

  it('handles empty localStorage gracefully', async () => {
    const { clearAllStorage } = await importHooks()
    await expect(clearAllStorage()).resolves.toBeUndefined()
  })
})
