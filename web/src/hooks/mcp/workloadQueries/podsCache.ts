import type { PodInfo, PodIssue } from '../types'

// ---------------------------------------------------------------------------
// Module-level caches for pods and pod issues data (persist across navigation)
// ---------------------------------------------------------------------------

export const PODS_CACHE_KEY = 'kubestellar-pods-cache'

interface PodsCache {
  data: PodInfo[]
  timestamp: Date
  key: string
}

interface PodIssuesCache {
  data: PodIssue[]
  timestamp: Date
  key: string
}

/** Shared mutable cache state used by usePods, useAllPods and usePodIssues. */
export const podCacheStore: { pods: PodsCache | null; podIssues: PodIssuesCache | null } = {
  pods: null,
  podIssues: null,
}

// Load pods cache from localStorage on startup
export function loadPodsCacheFromStorage(cacheKey: string): { data: PodInfo[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PODS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        podCacheStore.pods = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

export function savePodsCacheToStorage() {
  if (podCacheStore.pods) {
    try {
      localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
        data: podCacheStore.pods.data,
        timestamp: podCacheStore.pods.timestamp.toISOString(),
        key: podCacheStore.pods.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

export function resetPodsCache() {
  try {
    localStorage.removeItem(PODS_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
  podCacheStore.pods = null
  podCacheStore.podIssues = null
}
