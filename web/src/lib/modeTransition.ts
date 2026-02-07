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
 */

// Registry of cache reset functions
const cacheResetRegistry = new Map<string, () => void | Promise<void>>()

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
  console.log(
    `[ModeTransition] Clearing ${cacheResetRegistry.size} registered caches`
  )

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
