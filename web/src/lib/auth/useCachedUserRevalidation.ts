// Background cached-user revalidation extracted from AuthContext.tsx (#24058).
// No behaviour change.

import { useEffect } from 'react'
import { DEMO_TOKEN_VALUE } from '../constants'
import {
  AUTH_USER_CACHE_VALIDATED_KEY,
  BACKEND_REVALIDATE_INTERVAL_MS,
  MAX_CACHED_USER_AGE_MS,
} from './tokenHelpers'

export function useCachedUserRevalidation(token: string | null, refreshUser: () => Promise<void>) {
  // #6067 — When the backend is unreachable, re-validate the cached user
  // periodically. If validation continues to fail past MAX_CACHED_USER_AGE_MS,
  // refreshUser() itself will drop the session. This background retry gives
  // us an opportunity to recover without requiring the user to interact.
  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return
    const intervalId = setInterval(() => {
      // Only re-validate if the cache is getting close to stale
      const validatedAtRaw = (() => {
        try { return localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch { return null }
      })()
      const validatedAt = validatedAtRaw ? Number(validatedAtRaw) : 0
      const cacheAge = validatedAt ? Date.now() - validatedAt : Number.POSITIVE_INFINITY
      // Only re-validate if cache is older than half the max age — otherwise
      // we're spending cycles validating fresh data.
      const REVALIDATE_AGE_THRESHOLD_MS = MAX_CACHED_USER_AGE_MS / 2
      if (cacheAge >= REVALIDATE_AGE_THRESHOLD_MS) {
        refreshUser().catch(() => { /* refreshUser handles its own errors */ })
      }
    }, BACKEND_REVALIDATE_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, refreshUser])
}
