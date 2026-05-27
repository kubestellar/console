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

import { MS_PER_DAY } from '../../../lib/constants/time'
import { getStaleCacheMetaKeys, useStaleCacheCleanup } from '../useStaleCacheCleanup'

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
