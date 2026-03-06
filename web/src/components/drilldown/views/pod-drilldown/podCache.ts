import type { CachedData } from './types'

/**
 * Module-level pod data cache - persists when dialog is closed/reopened.
 * Keyed by `cluster/namespace/podName`.
 */

export interface PodCacheEntry extends CachedData {
  lastOpened: number
  openCount: number
}

const podDataCache = new Map<string, PodCacheEntry>()

/** Consider reopening within this window as "looking for something new" (triggers auto-refresh) */
export const RAPID_REOPEN_THRESHOLD_MS = 10_000

function getPodCacheKey(cluster: string, namespace: string, pod: string): string {
  return `${cluster}/${namespace}/${pod}`
}

export function getPodCache(cluster: string, namespace: string, pod: string): PodCacheEntry | undefined {
  return podDataCache.get(getPodCacheKey(cluster, namespace, pod))
}

export function setPodCache(cluster: string, namespace: string, pod: string, data: Partial<PodCacheEntry>): void {
  const key = getPodCacheKey(cluster, namespace, pod)
  const existing = podDataCache.get(key) || { lastOpened: Date.now(), openCount: 0 }
  podDataCache.set(key, { ...existing, ...data })
}

/** Remove cache entries older than 5 minutes */
const POD_CACHE_MAX_AGE_MS = 5 * 60 * 1000

export function cleanupPodCache(): void {
  const now = Date.now()
  for (const [key, entry] of podDataCache.entries()) {
    if (now - entry.lastOpened > POD_CACHE_MAX_AGE_MS) {
      podDataCache.delete(key)
    }
  }
}
