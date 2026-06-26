// ---------------------------------------------------------------------------
// Shared Polling Manager
// ---------------------------------------------------------------------------
//
// Deduplicates polling intervals across multiple React hook instances.
// When two components mount the same hook (e.g. usePods for the same
// cluster/namespace), each creates its own setInterval, causing duplicate
// API requests every tick.
//
// This module maintains a single setInterval per unique cache key.
// Components subscribe/unsubscribe; the interval starts on first subscriber
// and stops when the last one leaves.
//
// Subscribers are tracked by a unique numeric ID rather than callback
// reference identity. This prevents stale callbacks from accumulating
// when React effects re-run (e.g. due to dependency changes or StrictMode
// double-mount), since unsubscribe always removes by the stable ID that
// was captured in the same closure as the subscribe call.
// ---------------------------------------------------------------------------

/** Auto-incrementing subscriber ID to avoid reference-identity issues */
let nextSubscriberId = 0

interface PollingEntry {
  /** The active interval handle, or null when no subscribers */
  intervalId: ReturnType<typeof setInterval> | null
  /** Map from subscriber ID to callback */
  subscribers: Map<number, () => void>
  /** The polling interval in milliseconds */
  intervalMs: number
}

/** Map from cache key to its polling entry */
const pollingRegistry = new Map<string, PollingEntry>()

/**
 * Subscribe to a shared polling interval for the given cache key.
 *
 * - On the first subscriber for a key, a single setInterval is created.
 * - On subsequent subscribers, no new interval is created; they piggy-back
 *   on the existing one.
 * - Returns an unsubscribe function. When the last subscriber unsubscribes,
 *   the interval is cleared.
 *
 * @param key        Unique cache key (e.g. "pods:cluster-1:default")
 * @param intervalMs Polling interval in milliseconds
 * @param callback   Function to call on each tick (typically `() => refetch(true)`)
 * @returns          Unsubscribe function to call on cleanup / unmount
 */
export function subscribePolling(
  key: string,
  intervalMs: number,
  callback: () => void,
): () => void {
  let entry = pollingRegistry.get(key)

  if (!entry) {
    // First subscriber for this key — create the entry (interval starts below)
    entry = {
      intervalId: null,
      subscribers: new Map(),
      intervalMs,
    }
    pollingRegistry.set(key, entry)
  }

  const id = nextSubscriberId++
  entry.subscribers.set(id, callback)

  // Start the interval if this is the first subscriber
  if (entry.subscribers.size === 1 && entry.intervalId === null) {
    entry.intervalId = setInterval(() => {
      // Notify all current subscribers on each tick
      const current = pollingRegistry.get(key)
      if (current) {
        current.subscribers.forEach(cb => cb())
      }
    }, intervalMs)
  }

  // Return unsubscribe function — uses the stable `id` rather than
  // the callback reference, so cleanup always removes the correct entry
  return () => {
    const current = pollingRegistry.get(key)
    if (!current) return

    current.subscribers.delete(id)

    // If no subscribers remain, stop the interval and clean up
    if (current.subscribers.size === 0) {
      if (current.intervalId !== null) {
        clearInterval(current.intervalId)
        current.intervalId = null
      }
      pollingRegistry.delete(key)
    }
  }
}
