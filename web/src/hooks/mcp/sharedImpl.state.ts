// Shared cluster cache state and subscriber management

import { startTransition } from 'react'
import { isDemoMode, isNetlifyDeployment, subscribeDemoMode } from '../../lib/demoMode'
import { registerCacheReset, triggerAllRefetches } from '../../lib/modeTransition'
import { resetAllCacheFailures } from '../../lib/cache'
import { setClusterCacheRefClusters } from './clusterCacheRef'
import { shareMetricsBetweenSameServerClusters } from './clusterUtils'
import {
  CLUSTER_CACHE_KEY,
  CLUSTER_DIST_CACHE_KEY,
  applyDistributionCache,
  updateDistributionCache,
  loadClusterCacheFromStorage,
  saveClusterCacheToStorage,
  mergeWithStoredClusters,
} from './sharedImpl.persistence'
import { getDemoClusters } from './sharedImpl.demo'
import { CLUSTER_NOTIFY_DEBOUNCE_MS } from './sharedImpl.constants'
import type { ClusterCache, ClusterSubscriber } from './sharedImpl.types'
import { updatesTouchData, updatesTouchUI } from './sharedImpl.types'
import type { ClusterInfo } from './types'

// ============================================================================
// Shared Cluster State - ensures all useClusters() consumers see the same data
// ============================================================================
//
// NOTE (#7865): the cache is internally split into two slices so that heavy
// cluster-data updates can be wrapped in React.startTransition() (interruptible,
// yielding to SPA navigation) while small UI-indicator updates stay urgent
// (so the refresh spinner on the logo reliably paints on → off). See the
// `dataSubscribers` / `uiSubscribers` split below.
//
// The public `ClusterCache` shape is kept as a single merged object so all
// existing consumers (`useClusters()`, `clusterCache.clusters.find(...)`, etc.)
// continue to work unchanged.

// Module-level shared state - initialize from localStorage if available
const storedClusters = loadClusterCacheFromStorage()
// In forced demo mode (Netlify), don't show loading - demo data will be set synchronously
const hasInitialData = storedClusters.length > 0 || isNetlifyDeployment
export let clusterCache: ClusterCache = {
  clusters: storedClusters,
  lastUpdated: storedClusters.length > 0 ? new Date() : null,
  isLoading: !hasInitialData, // Don't show loading if we have cached data or are in forced demo mode
  isRefreshing: false,
  error: null,
  consecutiveFailures: 0,
  isFailed: false,
  lastRefresh: storedClusters.length > 0 ? new Date() : null,
}

// Seed the standalone clusterCacheRef at module init
setClusterCacheRefClusters(storedClusters)

// Subscribers that get notified when cluster state changes.
// Split into two sets (#7865):
//  - dataSubscribers: notified inside React.startTransition(), so navigation
//    can pre-empt the heavy re-render that a new cluster list triggers.
//  - uiSubscribers: notified urgently (outside startTransition) so the
//    refresh-spinner / loading flags always commit and paint immediately.
export const dataSubscribers = new Set<ClusterSubscriber>()
export const uiSubscribers = new Set<ClusterSubscriber>()

/**
 * Back-compat alias for the pre-split single subscriber set. Subscribers
 * added here receive BOTH data and UI updates (same as the old behavior),
 * but the notification path still honors the split (startTransition for
 * data, urgent for UI). New code should prefer `dataSubscribers` or
 * `uiSubscribers` directly, or the `subscribeClusterCache*` helpers below.
 */
export const clusterSubscribers: Set<ClusterSubscriber> = new Set<ClusterSubscriber>()

/** Notify only data subscribers, wrapped in startTransition (interruptible). */
export function notifyClusterDataSubscribers() {
  const snapshot = clusterCache
  startTransition(() => {
    Array.from(dataSubscribers).forEach(subscriber => subscriber(snapshot))
  })
}

/** Notify only UI subscribers, urgently (outside startTransition). */
export function notifyClusterUISubscribers() {
  const snapshot = clusterCache
  Array.from(uiSubscribers).forEach(subscriber => subscriber(snapshot))
}

/**
 * Back-compat: notify every legacy subscriber exactly once. Legacy
 * subscribers (added to `clusterSubscribers`) receive both data and UI
 * updates on a single call, so we fire them here — NOT inside
 * `notifyClusterDataSubscribers` / `notifyClusterUISubscribers`, which
 * would double-notify them whenever both slices change. Data-subscriber
 * notification still goes through `startTransition` via the split APIs.
 *
 * Used by code paths that mutate the cache directly (not via
 * updateClusterCache) — see `updateSingleClusterInCache`,
 * `refreshSingleCluster`, HMR reset, and mode-transition / demo-toggle
 * handlers.
 */
export function notifyClusterSubscribers() {
  const snapshot = clusterCache
  // Urgent leg — UI subscribers + legacy (merged) subscribers.
  Array.from(uiSubscribers).forEach(subscriber => subscriber(snapshot))
  Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
  // Interruptible leg — only the heavy-data subscribers.
  startTransition(() => {
    Array.from(dataSubscribers).forEach(subscriber => subscriber(snapshot))
  })
}

/**
 * Clear all cluster caches on logout so data from a previous user session
 * does not leak to the next login (#5405). Clears both localStorage keys
 * and the module-level in-memory cache, then notifies subscribers so the
 * UI resets to a loading/empty state.
 */
export function clearClusterCacheOnLogout(): void {
  try {
    localStorage.removeItem(CLUSTER_CACHE_KEY)
    localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }

  Object.assign(clusterCache, {
    clusters: [],
    lastUpdated: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    consecutiveFailures: 0,
    isFailed: false,
    lastRefresh: null,
  })
  notifyClusterSubscribers()
}

// ============================================================================
// Demo Mode Integration - Clear cluster cache when demo mode toggles ON
// ============================================================================

let lastClusterDemoMode: boolean | null = null

/**
 * Clear cluster cache and reset to demo data when demo mode toggles ON.
 * This ensures the clusters page shows demo data instead of cached live data.
 */
function handleClusterDemoModeChange() {
  const currentDemoMode = isDemoMode()
  if (lastClusterDemoMode !== null && lastClusterDemoMode !== currentDemoMode) {
    if (currentDemoMode) {
      // Switching TO demo mode - clear localStorage and reset to demo data
      try {
        localStorage.removeItem(CLUSTER_CACHE_KEY)
        localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
      } catch {
        // Ignore storage errors
      }

      // Reset cluster cache to demo data
      Object.assign(clusterCache, {
        clusters: getDemoClusters(),
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        isFailed: false,
        lastRefresh: new Date(),
      })
      notifyClusterSubscribers()
    }
    // When switching FROM demo mode, fullFetchClusters will be called by useClusters hook
  }
  lastClusterDemoMode = currentDemoMode
}

// Initialize and subscribe to demo mode changes
if (typeof window !== 'undefined') {
  handleClusterDemoModeChange()
  subscribeDemoMode(handleClusterDemoModeChange)

  // Register with mode transition coordinator for unified cache clearing
  registerCacheReset('clusters', () => {
    try {
      localStorage.removeItem(CLUSTER_CACHE_KEY)
      localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    // Reset to loading state (shows skeletons) with empty data
    Object.assign(clusterCache, {
      clusters: [],
      lastUpdated: null,
      isLoading: true, // Triggers skeleton display
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })
    notifyClusterSubscribers()
  })
}

// Debounced notification for batching rapid updates (prevents flashing during health checks).
// This path is used by `updateSingleClusterInCache`, which mutates the heavy
// `clusters` array, so we dispatch to DATA subscribers inside startTransition.
// Legacy merged subscribers also receive the update (urgent) so the
// pre-split contract is preserved.
let notifyTimeout: ReturnType<typeof setTimeout> | null = null
export function notifyClusterSubscribersDebounced() {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout)
  }
  notifyTimeout = setTimeout(() => {
    const snapshot = clusterCache
    Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
    notifyClusterDataSubscribers()
    notifyTimeout = null
  }, CLUSTER_NOTIFY_DEBOUNCE_MS)
}

// Update shared cluster cache
export function updateClusterCache(updates: Partial<ClusterCache>) {
  const hadClusters = clusterCache.clusters.length > 0

  // Apply cached distributions and merge with stored data to preserve metrics
  if (updates.clusters) {
    updates.clusters = mergeWithStoredClusters(updates.clusters)
    updates.clusters = applyDistributionCache(updates.clusters)
    // Save cluster data to localStorage
    saveClusterCacheToStorage(updates.clusters)
    updateDistributionCache(updates.clusters)
  }
  // Mutate in place so that any module holding a reference to the exported
  // `clusterCache` object sees the update (ESM live-binding of `let` exports
  // is not preserved by all bundlers / test runners).
  Object.assign(clusterCache, updates)

  // Keep the standalone clusterCacheRef in sync (breaks circular import)
  if (updates.clusters) {
    setClusterCacheRefClusters(clusterCache.clusters)
  }

  // Route notifications based on which slice the updates touch (#7865).
  // UI fires first (urgent) so spinner on/off commits immediately, then
  // data fires inside startTransition so navigation can pre-empt the
  // heavy re-render caused by a new cluster list.
  const touchesUI = updatesTouchUI(updates)
  const touchesData = updatesTouchData(updates)
  if (touchesUI) {
    notifyClusterUISubscribers()
  }
  if (touchesData) {
    notifyClusterDataSubscribers()
  }
  // Legacy merged subscribers are fired exactly once per updateClusterCache
  // call so the pre-split contract (one notify per update) is preserved.
  if (touchesUI || touchesData) {
    const snapshot = clusterCache
    Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
  } else {
    // If the updates somehow touch neither slice, fall back to notifying
    // every subscriber so nothing gets silently dropped.
    notifyClusterSubscribers()
  }

  // When clusters become available for the first time, reset all cache
  // failures and trigger immediate refetch. This fixes the race condition
  // where hooks fire before WebSocket delivers cluster data, fail, and
  // enter exponential backoff — leaving cards empty even after clusters load.
  if (!hadClusters && clusterCache.clusters.length > 0) {
    resetAllCacheFailures()
    triggerAllRefetches()
  }
}

// Update a single cluster in the shared cache (debounced to prevent flashing)
export function updateSingleClusterInCache(clusterName: string, updates: Partial<ClusterInfo>) {
  let updatedClusters = clusterCache.clusters.map(c => {
    if (c.name !== clusterName) return c

    // Merge updates with existing data
    const merged = { ...c }

    // For each update field, only apply if value is meaningful
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        // Don't overwrite with undefined - keep existing value
        return
      }

      // For numeric metrics, only fall back to cached when new value is undefined.
      // A real zero (e.g. scaled-to-zero) must be respected — see #5443.
      // NOTE: reachability (key === 'reachable') is no longer blocked by cached
      // node data — the useMCP hook already gates reachable=false behind 5 minutes
      // of consecutive failures, so the value is authoritative — see #5444.

      // Apply the update
      (merged as Record<string, unknown>)[key] = value
    })

    return merged
  })

  // Share metrics between clusters pointing to the same server
  // This ensures aliases (like "prow") get metrics from their full-context counterparts
  // Include nodeCount and podCount to ensure all health data is shared
  if (updates.nodeCount !== undefined || updates.podCount !== undefined || updates.cpuCores !== undefined || updates.memoryGB !== undefined || updates.storageGB !== undefined || updates.cpuRequestsCores !== undefined || updates.memoryRequestsGB !== undefined) {
    updatedClusters = shareMetricsBetweenSameServerClusters(updatedClusters)
  }

  Object.assign(clusterCache, { clusters: updatedClusters })
  // Persist all cluster data to localStorage
  saveClusterCacheToStorage(updatedClusters)
  // Persist distribution changes
  if (updates.distribution) {
    updateDistributionCache(updatedClusters)
  }
  // Use debounced notification to batch multiple cluster updates
  notifyClusterSubscribersDebounced()
}

// Subscribe to cluster cache changes (for modules that need reactive updates).
// Back-compat API: receives BOTH data and UI updates. Prefer the split
// variants below for new code.
export function subscribeClusterCache(callback: (cache: ClusterCache) => void): () => void {
  clusterSubscribers.add(callback)
  return () => clusterSubscribers.delete(callback)
}

/** Subscribe to heavy cluster-data updates only (notifications are interruptible). */
export function subscribeClusterData(callback: (cache: ClusterCache) => void): () => void {
  dataSubscribers.add(callback)
  return () => dataSubscribers.delete(callback)
}

/** Subscribe to tiny UI-indicator updates only (notifications are urgent). */
export function subscribeClusterUI(callback: (cache: ClusterCache) => void): () => void {
  uiSubscribers.add(callback)
  return () => uiSubscribers.delete(callback)
}

// Track if initial fetch has been triggered (to avoid duplicate fetches)
export let initialFetchStarted = false

// Getter/setter functions for module-level state (vitest CJS transform does
// not preserve ESM live bindings for `let` exports, so tests must use these
// functions instead of reading the exported variable directly).
export function setInitialFetchStarted(value: boolean) {
  initialFetchStarted = value
}

export function getInitialFetchStarted(): boolean {
  return initialFetchStarted
}
