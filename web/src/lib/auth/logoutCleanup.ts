// Logout cleanup helpers for AuthProvider.
// Extracted from AuthContext.tsx (issue #24058) — logic unchanged.

import { dashboardSync } from '../dashboards/dashboardSync'
import { clearPermissionsCache } from '../../hooks/usePermissions'
import { disconnectPresence } from '../../hooks/useActiveUsers'
import { clearSSECache } from '../sseClient'
import { clearClusterCacheOnLogout } from '../../hooks/mcp/shared'
import { clearAgentToken } from '../../hooks/mcp/agentFetch'
import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_HAS_SESSION } from '../constants'
import { safeRemove, safeSet } from '../safeLocalStorage'
import { clearStoredAuthToken, getStoredAuthToken } from '../authToken'
import { setDemoMode as setGlobalDemoMode } from '../demoMode'
import { AUTH_USER_CACHE_KEY, cacheUser } from './tokenHelpers'

/**
 * Invalidate the server-side session before clearing client state (#4751).
 * Fire-and-forget: even if the backend call fails, the caller still clears
 * local state so the user is logged out on the client side.
 */
export async function invalidateServerSession(): Promise<void> {
  const currentToken = await getStoredAuthToken()
  if (currentToken && currentToken !== DEMO_TOKEN_VALUE) {
    fetch('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }).catch(() => {
      // Backend unreachable — token will expire naturally
    })
  }
}

/** Clear every client-side store that may hold a token or cached user. */
export async function clearLocalAuthStorage(): Promise<void> {
  // Clear every place a token or cached user could live. The kc-agent token
  // now lives in memory with expiring sessionStorage fallback, so explicitly
  // wipe both session-scoped stores on logout to avoid leaking into the next
  // session.
  await clearStoredAuthToken()
  clearAgentToken()
  // A real authenticated session may have auto-enabled demo data when the
  // local agent was absent. Signing out must leave the user unauthenticated
  // instead of allowing a protected route to re-enter the demo dashboard.
  safeSet(STORAGE_KEY_DEMO_MODE, 'false')
  setGlobalDemoMode(false, true)
  safeRemove(AUTH_USER_CACHE_KEY)
  safeRemove(STORAGE_KEY_HAS_SESSION)
  try {
    sessionStorage.removeItem(AUTH_USER_CACHE_KEY)
    // Rotate the presence session ID so the next login is tracked as a
    // brand-new session instead of inheriting the logged-out user's.
    sessionStorage.removeItem('kc-session-id')
  } catch {
    // sessionStorage may be unavailable in some embedded contexts — ignore.
  }
  cacheUser(null)
}

/** Clear per-session in-memory/localStorage caches and disconnect presence. */
export function clearSessionCaches(): void {
  // Clear dashboard sync cache
  dashboardSync.clearCache()
  // Clear permissions cache so the next login doesn't serve stale data
  clearPermissionsCache()
  // Clear SSE result cache to prevent stale data from previous session (#4712)
  clearSSECache()
  // Clear cluster caches (localStorage + in-memory) so the next user
  // doesn't see stale cluster names, metrics, or distributions (#5405)
  clearClusterCacheOnLogout()
  // Disconnect presence WebSocket to stop transmitting stale auth tokens (#4936)
  disconnectPresence()
}
