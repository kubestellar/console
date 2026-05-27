import { useEffect } from 'react'
import { safeGetItem, safeRemoveItem } from '../../lib/utils/localStorage'
import { MS_PER_DAY } from '../../lib/constants/time'
import { dispatchStaleCacheCleanupEvent } from '../../lib/staleCacheEvents'

const CACHE_META_PREFIX = 'kc_meta:'
const STALE_META_THRESHOLD_MS = MS_PER_DAY
const CACHE_META_TIMESTAMP_FIELDS = [
  'lastSuccessfulRefresh',
  'lastUpdated',
  'timestamp',
  'updatedAt',
] as const

type CacheMetaTimestampField = typeof CACHE_META_TIMESTAMP_FIELDS[number]
type CacheMetaStorageValue = Partial<Record<CacheMetaTimestampField, number>>

function getCacheMetaTimestamp(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null

  const meta = value as CacheMetaStorageValue
  for (const field of CACHE_META_TIMESTAMP_FIELDS) {
    const timestamp = meta[field]
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp
    }
  }

  return null
}

export interface StaleCacheKeyInfo {
  key: string
  ageMs: number
}

/**
 * Returns stale kc_meta: keys along with their age in milliseconds.
 * Keys with no valid timestamp are reported with ageMs = Infinity.
 */
export function getStaleCacheMetaKeysWithAge(now: number = Date.now()): StaleCacheKeyInfo[] {
  try {
    const staleKeys: StaleCacheKeyInfo[] = []

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(CACHE_META_PREFIX)) continue

      const raw = safeGetItem(key)
      if (!raw) {
        staleKeys.push({ key, ageMs: Infinity })
        continue
      }

      try {
        const parsed: unknown = JSON.parse(raw)
        const timestamp = getCacheMetaTimestamp(parsed)
        if (timestamp === null) {
          staleKeys.push({ key, ageMs: Infinity })
        } else {
          const age = now - timestamp
          if (age > STALE_META_THRESHOLD_MS) {
            staleKeys.push({ key, ageMs: age })
          }
        }
      } catch {
        staleKeys.push({ key, ageMs: Infinity })
      }
    }

    return staleKeys
  } catch {
    return []
  }
}

/** Legacy API — returns only key names for backward compatibility. */
export function getStaleCacheMetaKeys(now: number = Date.now()): string[] {
  return getStaleCacheMetaKeysWithAge(now).map((entry) => entry.key)
}

export function useStaleCacheCleanup() {
  useEffect(() => {
    const startMs = Date.now()
    const staleEntries = getStaleCacheMetaKeysWithAge()
    const staleKeysFound = staleEntries.length

    if (staleKeysFound === 0) {
      return
    }

    let staleKeysRemoved = 0
    for (const entry of staleEntries) {
      if (safeRemoveItem(entry.key)) {
        staleKeysRemoved++
      }
    }

    const finiteAges = staleEntries
      .map((e) => e.ageMs)
      .filter((age) => Number.isFinite(age))
    const oldestStaleAgeMs = finiteAges.length > 0 ? Math.max(...finiteAges) : 0
    const cleanupDurationMs = Date.now() - startMs

    dispatchStaleCacheCleanupEvent({
      staleKeysFound,
      staleKeysRemoved,
      oldestStaleAgeMs,
      cleanupDurationMs,
      timestamp: Date.now(),
    })
  }, [])
}
