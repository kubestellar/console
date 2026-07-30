// Singleton pub/sub for quantum qubit pattern changes
// Used to trigger histogram refresh when new execution data arrives
//
// Cross-tab synchronization:
// - localStorage writes emit 'storage' events to OTHER browser tabs (but not the current tab)
// - This enables multi-tab dashboards to stay synchronized
// - sessionStorage does NOT emit cross-tab events (tab-scoped only)

type PatternChangeCallback = (pattern: string) => void

const subscribers = new Set<PatternChangeCallback>()

export function notifyPatternChange(pattern: string): void {
  subscribers.forEach((cb) => cb(pattern))

  // Sync to other tabs via localStorage storage event
  // (storage events fire in other tabs when localStorage is modified)
  try {
    localStorage.setItem('__quantum_pattern_change', JSON.stringify({ pattern, ts: Date.now() }))
  } catch {
    // Storage quota exceeded or not available
  }
}

export function subscribeToPatternChanges(callback: PatternChangeCallback): () => void {
  subscribers.add(callback)

  // Listen for cross-tab pattern changes via localStorage storage events
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === '__quantum_pattern_change' && e.newValue) {
      try {
        const { pattern } = JSON.parse(e.newValue)
        callback(pattern)
      } catch {
        // Ignore parse errors
      }
    }
  }

  window.addEventListener('storage', handleStorageChange)

  // Return unsubscribe function
  return () => {
    subscribers.delete(callback)
    window.removeEventListener('storage', handleStorageChange)
  }
}
