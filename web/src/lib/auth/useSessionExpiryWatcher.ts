// JWT expiry watcher extracted from AuthContext.tsx (#24058).
// No behaviour change.

import { useEffect } from 'react'
import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_HAS_SESSION } from '../constants'
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from '../constants/http'
import { getStoredAuthToken } from '../authToken'
import { emitSessionRefreshFailure } from '../analytics'
import {
  EXPIRY_CHECK_INTERVAL_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  getJwtExpiryMs,
  showExpiryWarningBanner,
} from './tokenHelpers'

export function useSessionExpiryWatcher(token: string | null, logout: () => Promise<void>) {
  // Periodically check if the JWT is nearing expiry and show a warning banner.
  // When the user clicks "Refresh Now", silently call /auth/refresh for a new token.
  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return

    const checkExpiry = async () => {
      const currentToken = await getStoredAuthToken()
      if (!currentToken || currentToken === DEMO_TOKEN_VALUE) return

      const expiryMs = getJwtExpiryMs(currentToken)
      if (expiryMs === null) return

      const timeUntilExpiry = expiryMs - Date.now()
      // #6069 — Proactively log the user out the moment the token expires
      // instead of waiting for the next 401 to surface. This prevents a
      // window where the UI still looks authenticated but every API call
      // returns 401.
      if (timeUntilExpiry <= 0) {
        document.getElementById('session-expiry-warning')?.remove()
        await logout()
        return
      }
      if (timeUntilExpiry > EXPIRY_WARNING_THRESHOLD_MS) {
        // Token not near expiry — remove stale banner if present
        document.getElementById('session-expiry-warning')?.remove()
        return
      }
      showExpiryWarningBanner(async () => {
        // Re-read the token at click time instead of using the stale closure
        // value — the token may have been silently refreshed since the banner
        // was shown (#3909).
        const freshToken = await getStoredAuthToken()
        if (!freshToken || freshToken === DEMO_TOKEN_VALUE) return
        try {
          // #8108 — Do NOT send Authorization to /auth/refresh. Backend
          // RefreshToken revokes the JTI of the presented bearer before
          // minting the replacement; sending `freshToken` would invalidate
          // the token the rest of this page is still using. Cookie-only
          // flow: rely on the HttpOnly kc_auth cookie + CSRF header.
          const response = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              // #6588 — CSRF gate on /auth/refresh
              'X-Requested-With': 'XMLHttpRequest' },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
          if (response.ok) {
            // #6590 — /auth/refresh delivers the new JWT exclusively via the
            // HttpOnly kc_auth cookie. There is no token in the JSON body to
            // copy into localStorage; the browser will use the refreshed
            // cookie automatically on subsequent requests. Mark the session
            // hint so future page loads know to attempt cookie restoration.
            try {
              localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
            } catch {
              // localStorage quota — best-effort hint
            }
          } else {
            // #6930 — A definitive auth failure from the banner refresh
            // should also clear the session hint to prevent stale loops.
            if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
              localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
            }
          }
        } catch (err: unknown) {
          emitSessionRefreshFailure(err instanceof Error ? err.message : 'network error')
        }
      })
    }

    // Check once immediately, then every EXPIRY_CHECK_INTERVAL_MS
    checkExpiry()
    const intervalId = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, logout])
}
