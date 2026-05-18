import { useEffect } from 'react'
import { safeGetItem, safeRemoveItem } from '../../lib/utils/localStorage'
import { MS_PER_DAY } from '../../lib/constants/time'

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

export function getStaleCacheMetaKeys(now: number = Date.now()): string[] {
  try {
    const keysToRemove: string[] = []

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(CACHE_META_PREFIX)) continue

      const raw = safeGetItem(key)
      if (!raw) {
        keysToRemove.push(key)
        continue
      }

      try {
        const parsed: unknown = JSON.parse(raw)
        const timestamp = getCacheMetaTimestamp(parsed)
        if (timestamp === null || now - timestamp > STALE_META_THRESHOLD_MS) {
          keysToRemove.push(key)
        }
      } catch {
        keysToRemove.push(key)
      }
    }

    return keysToRemove
  } catch {
    return []
  }
}

export function useStaleCacheCleanup() {
  useEffect(() => {
    getStaleCacheMetaKeys().forEach((key) => {
      safeRemoveItem(key)
    })
  }, [])
}
