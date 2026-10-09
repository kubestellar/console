// isAuthenticated derivation extracted from AuthContext.tsx (#24058).
// No behaviour change.

import { DEMO_TOKEN_VALUE, STORAGE_KEY_HAS_SESSION } from '../constants'
import type { User } from './types'
import { isJWTExpired } from './tokenHelpers'

export function computeIsAuthenticated(token: string | null, user: User | null): boolean {
  // Demo sentinel wins unconditionally.
  if (token === DEMO_TOKEN_VALUE) return true
  // #8108 — The cookie-only session (user + kc-has-session) is authoritative
  // and must be checked BEFORE falling back to the JS-readable token. Since
  // /auth/refresh no longer populates localStorage (#6590), any pre-existing
  // token will eventually cross its `exp` while the HttpOnly kc_auth cookie
  // is still perfectly valid — previously that short-circuited to
  // `false` here and logged the user out mid-session.
  if (user) {
    try {
      if (localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true') return true
    } catch {
      // localStorage unavailable — fall through to the token check
    }
  }
  if (token) {
    return !isJWTExpired(token)
  }
  return false
}
