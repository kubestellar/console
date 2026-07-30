import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const NOW_MS = new Date('2024-01-02T00:00:00.000Z').getTime()

type SafeGetItem = (key: string) => string | null

type SafeRemoveItem = (key: string) => boolean

const mockSafeGetItem = vi.fn<SafeGetItem>()
const mockSafeRemoveItem = vi.fn<SafeRemoveItem>()

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: (key: string) => mockSafeGetItem(key),
  safeRemoveItem: (key: string) => mockSafeRemoveItem(key),
}))

const mockDispatchStaleCacheCleanupEvent = vi.fn()
vi.mock('../../../lib/staleCacheEvents', () => ({
  dispatchStaleCacheCleanupEvent: (detail: unknown) => mockDispatchStaleCacheCleanupEvent(detail),
}))

import { MS_PER_DAY } from '../../../lib/constants/time'
import { getStaleCacheMetaKeys, getStaleCacheMetaKeysWithAge, useStaleCacheCleanup } from '../useStaleCacheCleanup'
import type { StaleCacheCleanupEventDetail } from '../../../lib/staleCacheEvents'

const originalLocalStorage = globalThis.localStorage

function setCacheMeta(key: string, value: Record<string, unknown>) {
  localStorage.setItem(key, JSON.stringify(value))
}

function getRemovedKeys(): string[] {
  return mockSafeRemoveItem.mock.calls.map(([key]) => key).sort()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
  vi.unstubAllGlobals()
  originalLocalStorage.clear()
  mockSafeGetItem.mockReset()
  mockSafeRemoveItem.mockReset()
  mockDispatchStaleCacheCleanupEvent.mockReset()
  mockSafeGetItem.mockImplementation((key) => localStorage.getItem(key))
  mockSafeRemoveItem.mockImplementation((key) => {
    localStorage.removeItem(key)
    return true
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  originalLocalStorage.clear()
})

describe('getStaleCacheMetaKeys', () => {
  it('includes kc_meta keys with timestamps older than one day', () => {
    setCacheMeta('kc_meta:stale', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual(['kc_meta:stale'])
  })

  it('excludes kc_meta keys with timestamps newer than one day', () => {
    setCacheMeta('kc_meta:fresh', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY + 1,
    })

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual([])
  })

  it('ignores keys without the kc_meta prefix', () => {
    localStorage.setItem('not-meta', JSON.stringify({
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    }))

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual([])
  })

  it('includes prefixed keys when safeGetItem returns null or an empty string', () => {
    localStorage.setItem('kc_meta:null', 'unused')
    localStorage.setItem('kc_meta:empty', 'unused')

    mockSafeGetItem.mockImplementation((key) => {
      if (key === 'kc_meta:null') return null
      if (key === 'kc_meta:empty') return ''
      return localStorage.getItem(key)
    })

    expect(getStaleCacheMetaKeys(NOW_MS).sort()).toEqual([
      'kc_meta:empty',
      'kc_meta:null',
    ])
  })

  it('includes prefixed keys with malformed JSON', () => {
    localStorage.setItem('kc_meta:corrupt', '{bad-json')

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual(['kc_meta:corrupt'])
  })

  it('includes prefixed keys with valid JSON but no recognized timestamp field', () => {
    setCacheMeta('kc_meta:missing-timestamp', {
      consecutiveFailures: 1,
    })

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual(['kc_meta:missing-timestamp'])
  })

  it('keeps entries exactly at the stale threshold boundary', () => {
    setCacheMeta('kc_meta:boundary', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY,
    })

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual([])
  })

  it('checks timestamp fields in priority order and stops at the first valid value', () => {
    setCacheMeta('kc_meta:last-successful-refresh', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 10,
      lastUpdated: NOW_MS - 1,
      timestamp: NOW_MS - 1,
      updatedAt: NOW_MS - 1,
    })
    setCacheMeta('kc_meta:last-updated', {
      lastSuccessfulRefresh: 0,
      lastUpdated: NOW_MS - MS_PER_DAY - 10,
      timestamp: NOW_MS - 1,
      updatedAt: NOW_MS - 1,
    })
    setCacheMeta('kc_meta:timestamp', {
      lastSuccessfulRefresh: 0,
      lastUpdated: -1,
      timestamp: NOW_MS - 1,
      updatedAt: NOW_MS - MS_PER_DAY - 10,
    })
    setCacheMeta('kc_meta:updated-at', {
      lastSuccessfulRefresh: 0,
      lastUpdated: -1,
      timestamp: 0,
      updatedAt: NOW_MS - 1,
    })

    expect(getStaleCacheMetaKeys(NOW_MS).sort()).toEqual([
      'kc_meta:last-successful-refresh',
      'kc_meta:last-updated',
    ])
  })

  it('treats zero, negative, and Infinity timestamps as invalid and stale', () => {
    setCacheMeta('kc_meta:zero', {
      lastSuccessfulRefresh: 0,
    })
    setCacheMeta('kc_meta:negative', {
      lastSuccessfulRefresh: -1,
    })
    localStorage.setItem('kc_meta:infinity', '{"lastSuccessfulRefresh":1e309}')

    expect(getStaleCacheMetaKeys(NOW_MS).sort()).toEqual([
      'kc_meta:infinity',
      'kc_meta:negative',
      'kc_meta:zero',
    ])
  })

  it('returns an empty array when localStorage access throws', () => {
    vi.stubGlobal('localStorage', {
      get length() {
        throw new Error('storage unavailable')
      },
      key: () => null,
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    })

    expect(getStaleCacheMetaKeys(NOW_MS)).toEqual([])
  })
})

describe('useStaleCacheCleanup', () => {
  it('runs on mount and removes each stale cache key', () => {
    setCacheMeta('kc_meta:stale-a', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })
    setCacheMeta('kc_meta:stale-b', {
      updatedAt: NOW_MS - MS_PER_DAY - 2,
    })
    setCacheMeta('kc_meta:fresh', {
      lastSuccessfulRefresh: NOW_MS - 1,
    })

    renderHook(() => useStaleCacheCleanup())

    expect(getRemovedKeys()).toEqual(['kc_meta:stale-a', 'kc_meta:stale-b'])
  })

  it('does not rerun cleanup on rerender', () => {
    setCacheMeta('kc_meta:stale-once', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })

    const { rerender } = renderHook(
      ({ version }) => {
        useStaleCacheCleanup()
        return version
      },
      { initialProps: { version: 1 } },
    )

    rerender({ version: 2 })
    rerender({ version: 3 })

    expect(getRemovedKeys()).toEqual(['kc_meta:stale-once'])
    expect(mockSafeRemoveItem).toHaveBeenCalledTimes(1)
  })
})

describe('getStaleCacheMetaKeysWithAge', () => {
  it('returns key names with their age in milliseconds', () => {
    const staleAge = MS_PER_DAY + 5000
    setCacheMeta('kc_meta:aged', {
      lastSuccessfulRefresh: NOW_MS - staleAge,
    })

    const result = getStaleCacheMetaKeysWithAge(NOW_MS)

    expect(result).toEqual([{ key: 'kc_meta:aged', ageMs: staleAge }])
  })

  it('reports Infinity age for keys with no valid timestamp', () => {
    setCacheMeta('kc_meta:no-ts', { consecutiveFailures: 3 })

    const result = getStaleCacheMetaKeysWithAge(NOW_MS)

    expect(result).toEqual([{ key: 'kc_meta:no-ts', ageMs: Infinity }])
  })

  it('reports Infinity age for null/empty values', () => {
    localStorage.setItem('kc_meta:empty', 'x')
    mockSafeGetItem.mockImplementation((key) => {
      if (key === 'kc_meta:empty') return null
      return localStorage.getItem(key)
    })

    const result = getStaleCacheMetaKeysWithAge(NOW_MS)

    expect(result).toEqual([{ key: 'kc_meta:empty', ageMs: Infinity }])
  })
})

describe('useStaleCacheCleanup observability', () => {
  it('emits event with correct staleKeysFound count', () => {
    setCacheMeta('kc_meta:stale-1', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1000,
    })
    setCacheMeta('kc_meta:stale-2', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 2000,
    })

    renderHook(() => useStaleCacheCleanup())

    expect(mockDispatchStaleCacheCleanupEvent).toHaveBeenCalledTimes(1)
    const detail: StaleCacheCleanupEventDetail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    expect(detail.staleKeysFound).toBe(2)
  })

  it('emits event with correct oldestStaleAgeMs value', () => {
    setCacheMeta('kc_meta:old', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 5000,
    })
    setCacheMeta('kc_meta:older', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 99000,
    })

    renderHook(() => useStaleCacheCleanup())

    const detail: StaleCacheCleanupEventDetail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    expect(detail.oldestStaleAgeMs).toBe(MS_PER_DAY + 99000)
  })

  it('does not emit event when zero stale keys found', () => {
    setCacheMeta('kc_meta:fresh', {
      lastSuccessfulRefresh: NOW_MS - 1000,
    })

    renderHook(() => useStaleCacheCleanup())

    expect(mockDispatchStaleCacheCleanupEvent).not.toHaveBeenCalled()
  })

  it('emits event even if some safeRemoveItem calls fail', () => {
    setCacheMeta('kc_meta:fail-remove', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1000,
    })
    setCacheMeta('kc_meta:ok-remove', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 2000,
    })

    mockSafeRemoveItem.mockImplementation((key) => {
      if (key === 'kc_meta:fail-remove') return false
      localStorage.removeItem(key)
      return true
    })

    renderHook(() => useStaleCacheCleanup())

    expect(mockDispatchStaleCacheCleanupEvent).toHaveBeenCalledTimes(1)
    const detail: StaleCacheCleanupEventDetail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    expect(detail.staleKeysFound).toBe(2)
    expect(detail.staleKeysRemoved).toBe(1)
  })

  it('emits event with staleKeysRemoved matching successful removals', () => {
    setCacheMeta('kc_meta:a', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })
    setCacheMeta('kc_meta:b', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })
    setCacheMeta('kc_meta:c', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })

    renderHook(() => useStaleCacheCleanup())

    const detail: StaleCacheCleanupEventDetail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    expect(detail.staleKeysRemoved).toBe(3)
  })

  it('emits event with a valid timestamp and non-negative cleanupDurationMs', () => {
    setCacheMeta('kc_meta:stale', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })

    renderHook(() => useStaleCacheCleanup())

    const detail: StaleCacheCleanupEventDetail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    expect(detail.timestamp).toBe(NOW_MS)
    expect(detail.cleanupDurationMs).toBeGreaterThanOrEqual(0)
  })

  it('does not include key names in emitted event', () => {
    setCacheMeta('kc_meta:secret-key-name', {
      lastSuccessfulRefresh: NOW_MS - MS_PER_DAY - 1,
    })

    renderHook(() => useStaleCacheCleanup())

    const detail = mockDispatchStaleCacheCleanupEvent.mock.calls[0][0]
    const detailStr = JSON.stringify(detail)
    expect(detailStr).not.toContain('kc_meta:')
    expect(detailStr).not.toContain('secret-key-name')
  })
})
