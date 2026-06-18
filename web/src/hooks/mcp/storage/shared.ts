import { registerCacheReset } from '../../../lib/modeTransition'
import type { PVC } from '../types'

interface StorageSharedState {
  cacheVersion: number
  isResetting: boolean
}

interface PVCsCache {
  data: PVC[]
  timestamp: Date
  key: string
}

type StorageSubscriber = (state: StorageSharedState) => void

let storageSharedState: StorageSharedState = { cacheVersion: 0, isResetting: false }
const storageSubscribers = new Set<StorageSubscriber>()
export const PVCS_CACHE_KEY = 'kubestellar-pvcs-cache'
export let pvcsCache: PVCsCache | null = null

function notifyStorageSubscribers() {
  Array.from(storageSubscribers).forEach(subscriber => subscriber(storageSharedState))
}

export function subscribeStorageCache(callback: StorageSubscriber): () => void {
  storageSubscribers.add(callback)
  return () => storageSubscribers.delete(callback)
}

export function loadPVCsCacheFromStorage(cacheKey: string): { data: PVC[]; timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PVCS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key == cacheKey && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        pvcsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

export function savePVCsCacheToStorage() {
  if (!pvcsCache) return
  try {
    localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
      data: pvcsCache.data,
      timestamp: pvcsCache.timestamp.toISOString(),
      key: pvcsCache.key,
    }))
  } catch {
    // Ignore storage errors
  }
}

export function setPVCsCache(cache: PVCsCache | null) {
  pvcsCache = cache
}

if (typeof window !== 'undefined') {
  registerCacheReset('storage', () => {
    storageSharedState = { cacheVersion: storageSharedState.cacheVersion + 1, isResetting: true }
    notifyStorageSubscribers()

    try {
      localStorage.removeItem(PVCS_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }
    pvcsCache = null

    setTimeout(() => {
      storageSharedState = { ...storageSharedState, isResetting: false }
      notifyStorageSubscribers()
    }, 0)
  })
}
