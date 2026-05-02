/**
 * Shared state for workloads module - enables cache reset notifications to all consumers.
 * When cache version increments or isResetting flag changes, all subscribers are notified.
 */
export interface WorkloadsSharedState {
  cacheVersion: number  // Increments when cache is cleared to trigger re-fetch
  isResetting: boolean  // True during cache reset, triggers skeleton display
}

let workloadsSharedState: WorkloadsSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

// Subscribers that get notified when workloads cache is cleared
export type WorkloadsSubscriber = (state: WorkloadsSharedState) => void
const workloadsSubscribers = new Set<WorkloadsSubscriber>()

// Notify all subscribers of cache reset (exported for workloadQueries)
export function notifyWorkloadsSubscribers() {
  Array.from(workloadsSubscribers).forEach(subscriber => subscriber(workloadsSharedState))
}

// Subscribe to workloads cache changes (for hooks that need reactive updates)
export function subscribeWorkloadsCache(callback: WorkloadsSubscriber): () => void {
  workloadsSubscribers.add(callback)
  return () => workloadsSubscribers.delete(callback)
}

// Export shared state reference for workloadQueries to modify (for cache resets)
export function getWorkloadsSharedState(): WorkloadsSharedState {
  return workloadsSharedState
}

export function setWorkloadsSharedState(newState: Partial<WorkloadsSharedState>) {
  workloadsSharedState = { ...workloadsSharedState, ...newState }
}
