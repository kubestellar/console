import { isDemoMode, subscribeDemoMode } from '../demoMode'
import { registerCacheReset } from '../modeTransition'
import type { CacheState } from './cacheStorage'

export { isDemoMode, subscribeDemoMode }

export function registerCacheModeReset(clearCaches: () => void): void {
  if (typeof window !== 'undefined') {
    registerCacheReset('unified-cache', clearCaches)
  }
}

/**
 * Check if fetcher output is equivalent to the initial (empty) data.
 * Used to detect "no data available" responses that shouldn't overwrite cache.
 * Handles: empty arrays, objects with all-empty/zero fields, null.
 */
export function isEquivalentToInitial<T>(newData: T, initialData: T): boolean {
  // Null/undefined
  if (newData == null && initialData == null) return true

  // Arrays: both empty
  if (Array.isArray(newData) && Array.isArray(initialData)) {
    return (newData as unknown[]).length === 0 && (initialData as unknown[]).length === 0
  }

  // Objects: compare via JSON (catches {alerts:[], inventory:[], nodeCount:0} etc.)
  if (typeof newData === 'object' && typeof initialData === 'object') {
    try {
      return JSON.stringify(newData) === JSON.stringify(initialData)
    } catch {
      return false
    }
  }

  return false
}

interface DemoDisplayStateOptions<T> {
  effectiveEnabled: boolean
  state: CacheState<T>
  stableDemoData: T | undefined
  stableInitialData: T
  demoWhenEmpty: boolean
  dataIsEmpty: boolean
}

interface DemoDisplayStateResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
}

export function resolveDemoDisplayState<T>({
  effectiveEnabled,
  state,
  stableDemoData,
  stableInitialData,
  demoWhenEmpty,
  dataIsEmpty,
}: DemoDisplayStateOptions<T>): DemoDisplayStateResult<T> {
  // When disabled (demo mode), return demoData (or initialData) instead of cached live data
  // This ensures demo mode shows demo content while preserving cache for live mode
  const demoDisplayData = stableDemoData !== undefined ? stableDemoData : stableInitialData

  // demoWhenEmpty: fall back to demoData when live fetch returned empty results.
  // This handles "demo until X is installed" cards (e.g., Kagenti) that are in DEMO_DATA_CARDS
  // but fetch live data that returns empty when the feature isn't installed.
  const shouldFallbackToDemo = effectiveEnabled && demoWhenEmpty && stableDemoData !== undefined
    && !state.isLoading && dataIsEmpty

  // Optimistic demo: for demoWhenEmpty hooks, show demoData immediately while
  // the live fetch runs in the background.  This avoids skeleton flicker for
  // "demo until X is installed" cards — they render demo content instantly and
  // swap to real data only if the fetch returns non-empty results.
  // IMPORTANT: Only apply when current data is empty — if the store already has
  // real cached data (e.g. from initialData populated via localStorage), showing
  // demo data would discard that warm cache (#3397).
  const showOptimisticDemo = effectiveEnabled && demoWhenEmpty && stableDemoData !== undefined
    && state.isLoading && dataIsEmpty

  return {
    data: !effectiveEnabled ? demoDisplayData
      : shouldFallbackToDemo ? stableDemoData
      : showOptimisticDemo ? stableDemoData
      : state.data,
    isLoading: effectiveEnabled ? (state.isLoading && !shouldFallbackToDemo && !showOptimisticDemo) : false,
    isRefreshing: state.isRefreshing || showOptimisticDemo,
    isDemoFallback: shouldFallbackToDemo || !effectiveEnabled || showOptimisticDemo,
  }
}
