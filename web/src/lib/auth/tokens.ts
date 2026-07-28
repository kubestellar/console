/**
 * JWT and user-cache token helpers.
 *
 * Extracted from auth.tsx — see issue #15790 / #21605.
 */
import { MS_PER_SECOND } from '../constants/time'
import { safeRemove, safeSetJSON } from '../safeLocalStorage'
import { STORAGE_KEY_USER_CACHE } from '../constants'

export interface User {
  id: string
  github_id: string
  github_login: string
  email?: string
  slack_id?: string
  avatar_url?: string
  role?: 'admin' | 'editor' | 'viewer'
  onboarded: boolean
}

export interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (opts?: import('../devLogin').LoginOptions) => void
  logout: () => void
  setToken: (token: string, onboarded: boolean) => void
  refreshUser: (overrideToken?: string) => Promise<void>
}

export const AUTH_USER_CACHE_KEY = STORAGE_KEY_USER_CACHE
/** Timestamp (ms) of the last successful /api/me round-trip. */
export const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'

// How often (in ms) to check if the JWT is nearing expiry
export const EXPIRY_CHECK_INTERVAL_MS = 60_000
// Show a warning banner when the token expires within this many ms
export const EXPIRY_WARNING_THRESHOLD_MS = 30 * 60_000

/** #6067 — maximum age of cached user data (5 min) before we force re-validation. */
export const MAX_CACHED_USER_AGE_MS = 5 * 60 * 1_000
/** #6067 — interval for background re-validation when the backend is unreachable. */
export const BACKEND_REVALIDATE_INTERVAL_MS = 30_000

/**
 * Decode the expiry timestamp from a JWT without verifying signature.
 * Returns the `exp` value in ms, or null if the token isn't decodable.
 */
export function getJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return null
    return payload.exp * MS_PER_SECOND
  } catch {
    return null
  }
}

/**
 * #6058 — Return true only when a token is a parseable JWT whose `exp` has passed.
 * For opaque / non-JWT tokens we return false so we still attempt the /api/me call.
 */
export function isJWTExpired(token: string): boolean {
  const expiryMs = getJwtExpiryMs(token)
  if (expiryMs === null) return false
  return Date.now() >= expiryMs
}

export function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

export function cacheUser(userData: User | null) {
  if (userData) {
    safeSetJSON(AUTH_USER_CACHE_KEY, userData)
  } else {
    safeRemove(AUTH_USER_CACHE_KEY)
  }
}
