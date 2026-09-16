/**
 * Shared localStorage cache helpers and constants for the Helm hooks.
 *
 * Split from helm.ts (Issue #23155) so useHelmReleases, useHelmHistory and
 * useHelmValues can each import only what they need instead of sharing one
 * 824-line module.
 */
import type { HelmRelease, HelmHistoryEntry } from '../types'

// Helm releases cache with localStorage persistence
export const HELM_RELEASES_CACHE_KEY = 'kc-helm-releases-cache'
export const HELM_HISTORY_CACHE_KEY = 'kc-helm-history-cache'
export const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale
export const HELM_REFRESH_INTERVAL_MS = 120000 // 2 minutes auto-refresh

export interface HelmReleasesCache {
  data: HelmRelease[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  isDemoData: boolean
  listeners: Set<(state: HelmReleasesCacheState) => void>
}

export interface HelmReleasesCacheState {
  releases: HelmRelease[]
  isLoading: boolean  // Added for unified demo mode switching
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
  isDemoData: boolean
}

// Load from localStorage
export function loadHelmReleasesFromStorage(): { data: HelmRelease[], timestamp: number } {
  try {
    const stored = localStorage.getItem(HELM_RELEASES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

// Save to localStorage
export function saveHelmReleasesToStorage(data: HelmRelease[], timestamp: number) {
  try {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data, timestamp }))
  } catch { /* ignore storage errors */ }
}

// Module-level cache for Helm history - keyed by cluster:release
// Uses localStorage for persistence
export interface HelmHistoryCacheEntry {
  data: HelmHistoryEntry[]
  timestamp: number
  consecutiveFailures: number
}

// Load helm history cache from localStorage
export function loadHelmHistoryFromStorage(): Map<string, HelmHistoryCacheEntry> {
  try {
    const stored = localStorage.getItem(HELM_HISTORY_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed === 'object' && parsed !== null) {
        return new Map(Object.entries(parsed))
      }
    }
  } catch { /* ignore */ }
  return new Map()
}

// Save helm history cache to localStorage
export function saveHelmHistoryToStorage(cache: Map<string, HelmHistoryCacheEntry>) {
  try {
    const obj = Object.fromEntries(cache.entries())
    localStorage.setItem(HELM_HISTORY_CACHE_KEY, JSON.stringify(obj))
  } catch { /* ignore storage errors */ }
}
