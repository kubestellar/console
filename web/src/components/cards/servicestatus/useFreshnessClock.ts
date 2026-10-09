import { useEffect, useRef, useState } from 'react'
import {
  SERVICES_CACHE_TTL_MS,
  SERVICES_CACHE_STALE_MS,
} from '../../../lib/constants/network'

/**
 * Schedules at most two timeouts off `lastRefresh` — one for the
 * stale-threshold transition and one for the TTL/expired transition —
 * and re-renders the card only at those moments. Replaces the previous
 * 1-second interval that re-rendered indefinitely while `lastRefresh`
 * was truthy, even when the freshness badge was hidden (#6181).
 *
 * Returns the current wall-clock `Date.now()` snapshot, captured inside
 * the effect so the component stays pure per react-hooks rules.
 *
 * Note: `lastRefresh` is checked with `!= null` (NOT a truthy check) so
 * a `0` epoch timestamp would still be honored — the previous truthy
 * guard would have wrongly treated `0` as "no refresh" (#6181).
 */
export function useFreshnessClock(lastRefresh: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  // Re-render the card immediately when `lastRefresh` changes so the
  // memoized cacheAgeMs reflects the new origin without waiting for a
  // scheduled timeout.
  const lastRefreshRef = useRef(lastRefresh)
  useEffect(() => {
    if (lastRefreshRef.current !== lastRefresh) {
      lastRefreshRef.current = lastRefresh
      setNow(Date.now())
    }
    if (lastRefresh == null) return
    const elapsed = Date.now() - lastRefresh
    const msUntilStale = SERVICES_CACHE_STALE_MS - elapsed
    const msUntilExpired = SERVICES_CACHE_TTL_MS - elapsed
    const timers: number[] = []
    if (msUntilStale > 0) {
      timers.push(window.setTimeout(() => setNow(Date.now()), msUntilStale))
    }
    if (msUntilExpired > 0) {
      timers.push(window.setTimeout(() => setNow(Date.now()), msUntilExpired))
    }
    return () => {
      for (const id of timers) window.clearTimeout(id)
    }
  }, [lastRefresh])
  return now
}
