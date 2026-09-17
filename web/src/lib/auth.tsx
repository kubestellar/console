// Thin re-export barrel for the auth module. The implementation now lives
// under src/lib/auth/ split across context, hooks, and helpers so each file
// stays under the max-lines limit (tracked by #15790, split by #21605 and
// #22976): AuthContext.tsx (context + provider), hooks.ts (useAuth), and
// tokenHelpers.ts / types.ts (utilities and types). No behaviour change —
// all existing imports of `./auth` (or `../lib/auth`) keep working unchanged.

export { AuthProvider } from './auth/AuthContext'
export { useAuth } from './auth/hooks'
export type { User, AuthContextType } from './auth/types'
export { isJWTExpired } from './auth/tokenHelpers'

import {
  getJwtExpiryMs,
  showExpiryWarningBanner,
  AUTH_USER_CACHE_KEY,
  EXPIRY_CHECK_INTERVAL_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  MAX_CACHED_USER_AGE_MS,
} from './auth/tokenHelpers'

export const __testables = {
  getJwtExpiryMs,
  showExpiryWarningBanner,
  AUTH_USER_CACHE_KEY,
  EXPIRY_CHECK_INTERVAL_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  MAX_CACHED_USER_AGE_MS,
}
