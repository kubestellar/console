/**
 * Mode Transition Coordinator
 *
 * Central registry for cache reset functions. When demo mode is toggled,
 * all registered caches are cleared synchronously, triggering skeleton
 * loading states in all cards simultaneously.
 *
 * Each cache system registers its reset function at module initialization.
 * The reset function should:
 * 1. Clear stored data (localStorage, module variables)
 * 2. Set isLoading: true and data: [] or null
 * 3. Notify subscribers so React components re-render with skeletons
 *
 * Additionally, hooks can register refetch functions that are called AFTER
 * mode transition completes to fetch appropriate data (demo or live).
 */

// Registry of cache reset functions
const cacheResetRegistry = new Map<string, () => void | Promise<void>>()

// Registry of refetch functions - called after mode switch to trigger data re-fetch
const refetchRegistry = new Map<string, () => void | Promise<void>>()

// Mode transition version - increments on each toggle
let modeTransitionVersion = 0

/**
 * Register a cache reset function.
 * Called by cache systems at module initialization.
 *
 * @param key - Unique identifier for the cache (e.g., 'clusters', 'gpu-nodes')
 * @param resetFn - Function that clears the cache and sets loading state
 */
export function registerCacheReset(
  key: string,
  resetFn: () => void | Promise<void>
): void {
  cacheResetRegistry.set(key, resetFn)
}

/**
 * Unregister a cache reset function.
 * Called on module cleanup if needed.
 */
export function unregisterCacheReset(key: string): void {
  cacheResetRegistry.delete(key)
}

/**
 * Clear all registered caches.
 * Called by toggleDemoMode() before changing the demo mode state.
 *
 * Each reset function should set isLoading: true, triggering skeletons.
 * Cards will then fetch appropriate data (demo or live) based on the new mode.
 */
export function clearAllRegisteredCaches(): void {
  cacheResetRegistry.forEach((resetFn, key) => {
    try {
      resetFn()
    } catch (e) {
      console.error(`[ModeTransition] Failed to reset cache '${key}':`, e)
    }
  })
}

/**
 * Get the number of registered caches (for debugging).
 */
export function getRegisteredCacheCount(): number {
  return cacheResetRegistry.size
}

// ---------------------------------------------------------------------------
// UNIFIED REFETCH MECHANISM
// Hooks register refetch functions that are called after mode transitions
// ---------------------------------------------------------------------------

/**
 * Register a refetch function to be called after mode transitions.
 * Called by hooks in their useEffect to subscribe to mode changes.
 *
 * @param key - Unique identifier for this hook (e.g., 'gpu-nodes', 'pods')
 * @param refetchFn - Function that fetches appropriate data for current mode
 * @returns Unsubscribe function
 */
export function registerRefetch(
  key: string,
  refetchFn: () => void | Promise<void>
): () => void {
  refetchRegistry.set(key, refetchFn)
  return () => refetchRegistry.delete(key)
}

/**
 * Get current mode transition version.
 * Used by hooks to detect stale operations.
 */
export function getModeTransitionVersion(): number {
  return modeTransitionVersion
}

/**
 * Trigger all registered refetch functions.
 * Called after mode transition completes (after skeleton delay).
 */
export function triggerAllRefetches(): void {
  refetchRegistry.forEach((refetchFn, key) => {
    try {
      refetchFn()
    } catch (e) {
      console.error(`[ModeTransition] Failed to refetch '${key}':`, e)
    }
  })
}

/**
 * Increment mode transition version.
 * Called at the start of mode transition to invalidate in-flight fetches.
 */
export function incrementModeTransitionVersion(): void {
  modeTransitionVersion++
}
