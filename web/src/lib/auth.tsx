/**
 * Auth module barrel — re-exports everything from the auth sub-modules.
 *
 * Split into focused files in auth/ — see issue #15790 / #21605:
 *   auth/tokens.ts    — JWT helpers, user-cache utilities, type definitions
 *   auth/oidc.ts      — session-expiry warning banner
 *   auth/provider.tsx — AuthProvider component, useAuth hook, AuthContext
 *
 * All existing imports from '@/lib/auth' or '../lib/auth' continue to work.
 */
export type { User, AuthContextType } from './auth/tokens'
export {
  isJWTExpired,
  getJwtExpiryMs,
  getCachedUser,
  cacheUser,
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_VALIDATED_KEY,
  EXPIRY_CHECK_INTERVAL_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  MAX_CACHED_USER_AGE_MS,
  BACKEND_REVALIDATE_INTERVAL_MS,
} from './auth/tokens'
export { showExpiryWarningBanner } from './auth/oidc'
export { AuthContext, AuthProvider, useAuth } from './auth/provider'
