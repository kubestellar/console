// Cross-tab auth sync listener extracted from AuthContext.tsx (#24058).
// No behaviour change.

import { useEffect } from 'react'
import { DEMO_TOKEN_VALUE } from '../constants'
import { AUTH_TOKEN_SYNC_KEY, getStoredAuthToken, parseAuthTokenSyncEvent } from '../authToken'
import { ROUTES } from '../../config/routes'
import type { User } from './types'
import { AUTH_USER_CACHE_VALIDATED_KEY, cacheUser } from './tokenHelpers'

export function useAuthStorageSync(
  refreshUser: () => Promise<void>,
  setTokenState: (token: string | null) => void,
  setUser: (user: User | null) => void,
) {
  // Listen for auth sync events so logouts propagate across tabs even though
  // real session tokens now live in expiring browser storage wrappers instead
  // of plain localStorage entries.
  useEffect(() => {
    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key !== AUTH_TOKEN_SYNC_KEY) return
      const syncState = parseAuthTokenSyncEvent(e.newValue)
      if (syncState === 'cleared') {
        setTokenState(null)
        setUser(null)
        cacheUser(null)
        try {
          localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY)
        } catch (error: unknown) {
          console.error('[auth] failed to clear cached user validation key:', error)
        }
        document.getElementById('session-expiry-warning')?.remove()
        if (!window.location.pathname.startsWith(ROUTES.LOGIN)) {
          window.location.href = ROUTES.LOGIN
        }
        return
      }
      if (syncState === 'demo') {
        setTokenState(DEMO_TOKEN_VALUE)
        document.getElementById('session-expiry-warning')?.remove()
        return
      }
      if (syncState === 'session') {
        const syncedToken = await getStoredAuthToken()
        if (syncedToken) {
          setTokenState(syncedToken)
          document.getElementById('session-expiry-warning')?.remove()
          return
        }
        void refreshUser()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [refreshUser, setTokenState, setUser])
}
