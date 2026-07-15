/**
 * Observability events for stale cache cleanup.
 *
 * Emits a structured event after each cleanup run so that dashboards
 * and nightly health scripts can monitor cache hygiene without
 * exposing individual key names (per sec-check recommendation).
 */

const STALE_CACHE_CLEANUP_EVENT_NAME = 'kc:stale-cache-cleanup'

export interface StaleCacheCleanupEventDetail {
  /** Number of kc_meta: keys identified as stale */
  staleKeysFound: number
  /** Number of stale keys successfully removed */
  staleKeysRemoved: number
  /** Age in ms of the oldest stale key found (0 if none found) */
  oldestStaleAgeMs: number
  /** Duration in ms of the cleanup scan */
  cleanupDurationMs: number
  /** Timestamp when the cleanup completed */
  timestamp: number
}

export function dispatchStaleCacheCleanupEvent(detail: StaleCacheCleanupEventDetail): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<StaleCacheCleanupEventDetail>(STALE_CACHE_CLEANUP_EVENT_NAME, { detail }),
  )
}

export function subscribeToStaleCacheCleanupEvents(
  listener: (detail: StaleCacheCleanupEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<StaleCacheCleanupEventDetail>
    if (customEvent.detail) {
      listener(customEvent.detail)
    }
  }

  window.addEventListener(STALE_CACHE_CLEANUP_EVENT_NAME, handleEvent)
  return () => window.removeEventListener(STALE_CACHE_CLEANUP_EVENT_NAME, handleEvent)
}
