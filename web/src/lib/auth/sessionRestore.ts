// Cookie-based session restore extracted from AuthContext.tsx (#24058).
// No behaviour change — this is the /auth/refresh + /api/me flow that
// refreshUser() runs when there is no JS-readable token but the
// kc-has-session hint indicates a prior session.

import { setAgentToken } from '../../hooks/mcp/agentFetch'
import { FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_HAS_SESSION } from '../constants'
import { isLocalAgentSuppressed } from '../constants/network'
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from '../constants/http'
import { setAnalyticsUserId, setAnalyticsUserProperties } from '../analytics'
import { AuthRefreshResponseSchema, UserSchema } from '../schemas'
import { validateResponse } from '../schemas/validate'
import type { User } from './types'
import { AUTH_USER_CACHE_VALIDATED_KEY, cacheUser } from './tokenHelpers'

/**
 * Attempt to restore a session from the HttpOnly kc_auth cookie.
 * Returns true when the user was restored and `setUser` was called.
 */
export async function restoreCookieSession(
  oauthConfigured: boolean,
  setUser: (user: User) => void,
): Promise<boolean> {
  // #6066 — If the user has a valid HttpOnly cookie from a previous
  // session, /auth/refresh will mint a new JWT. Try that before showing
  // the login page so a page reload can restore the session silently.
  // #20823 — This also restores passwordless dev-login sessions on
  // in-cluster installs without OAuth, so the restore attempt runs
  // whenever the backend is up, not only when OAuth is configured.
  try {
    const refreshResponse = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // #6588 — CSRF gate on /auth/refresh
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (refreshResponse.ok) {
      // #6590 — /auth/refresh delivers the new JWT EXCLUSIVELY via the
      // HttpOnly kc_auth cookie. The body carries only
      // { refreshed: true, onboarded }. Since the cookie is HttpOnly,
      // we cannot read the token from JS — but the JWTAuth middleware
      // accepts the cookie on subsequent requests, so we can call
      // /api/me directly via cookie credentials to populate the user.
      const rawRefresh = await refreshResponse.json().catch(() => null)
      const data = validateResponse(AuthRefreshResponseSchema, rawRefresh, '/auth/refresh')
      if (data?.refreshed) {
        try {
          localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
        } catch {
          // localStorage quota — best-effort hint
        }
        // Fetch kc-agent token so agentFetch/WebSocket can authenticate
        if (!isLocalAgentSuppressed()) {
          try {
            const agentRes = await fetch('/api/agent/token', {
              credentials: 'same-origin',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
            })
            if (agentRes.ok) {
              const agentData = await agentRes.json()
              if (agentData.token) {
                setAgentToken(agentData.token)
              }
            }
          } catch {
            // Non-fatal: agent auth may fail while the browser session remains intact.
          }
        }
        const meResponse = await fetch('/api/me', {
          credentials: 'include',
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (meResponse.ok) {
          const rawUser = await meResponse.json().catch(() => null)
          const userData = validateResponse(UserSchema, rawUser, '/api/me') as User | null
          if (userData) {
            setUser(userData)
            cacheUser(userData)
            try {
              localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now()))
            } catch {
              // localStorage quota — best-effort
            }
            setAnalyticsUserId(userData.id)
            // #20823 — sessions restored on no-OAuth installs came from
            // the backend's passwordless dev-login, not GitHub OAuth.
            setAnalyticsUserProperties({ auth_mode: oauthConfigured ? 'github-oauth' : 'dev-login' })
            return true
          }
        }
      }
    }
    // #6930 — A 401/403 from /auth/refresh is a definitive signal that
    // the server session has expired. Clear the session hint so future
    // page loads don't keep hitting /auth/refresh in a loop.
    if (refreshResponse.status === HTTP_UNAUTHORIZED || refreshResponse.status === HTTP_FORBIDDEN) {
      localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
    }
  } catch {
    // Refresh failed (network error / timeout) — fall through to show
    // login page. Do NOT clear kc-has-session here: the server may be
    // temporarily unreachable and the session could still be valid.
  }
  return false
}
