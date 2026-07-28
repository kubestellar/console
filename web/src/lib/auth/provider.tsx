/**
 * AuthProvider component and useAuth hook.
 *
 * Extracted from auth.tsx — see issue #15790 / #21605.
 */
import { createContext, use, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react'
import { checkOAuthConfigured, checkOAuthConfiguredWithRetry } from '../api'
import { dashboardSync } from '../dashboards/dashboardSync'
import { clearPermissionsCache } from '../../hooks/usePermissions'
import { disconnectPresence } from '../../hooks/useActiveUsers'
import { clearSSECache } from '../sseClient'
import { clearClusterCacheOnLogout } from '../../hooks/mcp/shared'
import { clearAgentToken, setAgentToken } from '../../hooks/mcp/agentFetch'
import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_HAS_SESSION, STORAGE_KEY_ONBOARDED } from '../constants'
import { isLocalAgentSuppressed } from '../constants/network'
import { safeGet, safeRemove, safeSet } from '../safeLocalStorage'
import { AUTH_TOKEN_SYNC_KEY, clearStoredAuthToken, getStoredAuthToken, getStoredAuthTokenSync, parseAuthTokenSyncEvent, setStoredAuthToken } from '../authToken'
import { emitLogin, emitLogout, setAnalyticsUserId, setAnalyticsUserProperties, emitConversionStep, emitDeveloperSession, emitSessionRefreshFailure } from '../analytics'
import { setDemoMode as setGlobalDemoMode } from '../demoMode'
import { AuthRefreshResponseSchema, UserSchema } from '../schemas'
import { validateResponse } from '../schemas/validate'
import { ROUTES } from '../../config/routes'
import { redirectToDevLogin, type LoginOptions } from '../devLogin'
import {
  type User,
  type AuthContextType,
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_VALIDATED_KEY,
  EXPIRY_CHECK_INTERVAL_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  MAX_CACHED_USER_AGE_MS,
  BACKEND_REVALIDATE_INTERVAL_MS,
  isJWTExpired,
  getCachedUser,
  cacheUser,
  getJwtExpiryMs,
} from './tokens'
import { showExpiryWarningBanner } from './oidc'

export { type User, type AuthContextType, isJWTExpired }

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCachedUser)
  const [token, setTokenState] = useState<string | null>(getStoredAuthTokenSync)
  const [isLoading, setIsLoading] = useState(() => {
    const hasToken = !!getStoredAuthTokenSync()
    const hasCachedUser = !!getCachedUser()
    return !hasToken || (hasToken && !hasCachedUser)
  })

  const logout = useCallback(async () => {
    emitLogout()
    const currentToken = await getStoredAuthToken()
    if (currentToken && currentToken !== DEMO_TOKEN_VALUE) {
      fetch('/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      }).catch(() => { /* Backend unreachable — token will expire naturally */ })
    }
    await clearStoredAuthToken()
    clearAgentToken()
    safeSet(STORAGE_KEY_DEMO_MODE, 'false')
    setGlobalDemoMode(false, true)
    safeRemove(AUTH_USER_CACHE_KEY)
    safeRemove(STORAGE_KEY_HAS_SESSION)
    try {
      sessionStorage.removeItem(AUTH_USER_CACHE_KEY)
      sessionStorage.removeItem('kc-session-id')
    } catch { /* sessionStorage unavailable */ }
    cacheUser(null)
    setTokenState(null)
    setUser(null)
    dashboardSync.clearCache()
    clearPermissionsCache()
    clearSSECache()
    clearClusterCacheOnLogout()
    disconnectPresence()
  }, [])

  const setDemoMode = useCallback(async () => {
    const userExplicitlyDisabledDemo = safeGet(STORAGE_KEY_DEMO_MODE) === 'false'
    if (userExplicitlyDisabledDemo) return
    const isNetlifyPreview = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('netlify.app') ||
      window.location.hostname.includes('deploy-preview-')
    const demoOnboarded = isNetlifyPreview || safeGet(STORAGE_KEY_ONBOARDED) === 'true'
    await setStoredAuthToken(DEMO_TOKEN_VALUE)
    setTokenState(DEMO_TOKEN_VALUE)
    const demoUser: User = {
      id: 'demo-user',
      github_id: '12345',
      github_login: 'demo-user',
      email: 'demo@example.com',
      avatar_url: 'https://api.dicebear.com/9.x/bottts/svg?seed=stellar-commander&backgroundColor=0d1117',
      role: 'viewer',
      onboarded: demoOnboarded,
    }
    setUser(demoUser)
    cacheUser(demoUser)
    setAnalyticsUserId(demoUser.id)
    setAnalyticsUserProperties({ auth_mode: 'demo' })
    setGlobalDemoMode(true)
  }, [])

  const refreshUser = useCallback(async (overrideToken?: string) => {
    const effectiveToken = overrideToken || await getStoredAuthToken()
    if (!effectiveToken) {
      let backendUp = false
      let oauthConfigured = false
      let inCluster = false
      try {
        ({ backendUp, oauthConfigured, inCluster } = await checkOAuthConfiguredWithRetry())
      } catch { /* Complete failure — fall through to demo mode */ }

      if (backendUp) {
        const hadPriorSession = !!safeGet(STORAGE_KEY_HAS_SESSION)
        if (hadPriorSession) {
          try {
            const refreshResponse = await fetch('/auth/refresh', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
              signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
            })
            if (refreshResponse.ok) {
              const rawRefresh = await refreshResponse.json().catch(() => null)
              const data = validateResponse(AuthRefreshResponseSchema, rawRefresh, '/auth/refresh')
              if (data?.refreshed) {
                try { localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true') } catch { /* quota */ }
                if (!isLocalAgentSuppressed()) {
                  try {
                    const agentRes = await fetch('/api/agent/token', {
                      credentials: 'same-origin',
                      headers: { 'X-Requested-With': 'XMLHttpRequest' },
                      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
                    })
                    if (agentRes.ok) {
                      const agentData = await agentRes.json()
                      if (agentData.token) setAgentToken(agentData.token)
                    }
                  } catch { /* Non-fatal */ }
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
                    try { localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now())) } catch { /* quota */ }
                    setAnalyticsUserId(userData.id)
                    setAnalyticsUserProperties({ auth_mode: oauthConfigured ? 'github-oauth' : 'dev-login' })
                    return
                  }
                }
              }
            }
            const HTTP_UNAUTHORIZED = 401
            const HTTP_FORBIDDEN = 403
            if (refreshResponse.status === HTTP_UNAUTHORIZED || refreshResponse.status === HTTP_FORBIDDEN) {
              localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
            }
          } catch { /* Refresh failed — fall through */ }
        }
        if (oauthConfigured) return
        if (inCluster && safeGet(STORAGE_KEY_DEMO_MODE) !== 'true') {
          redirectToDevLogin()
          return
        }
      }
      setDemoMode()
      return
    }

    if (effectiveToken !== DEMO_TOKEN_VALUE && isJWTExpired(effectiveToken)) {
      clearStoredAuthToken()
      safeRemove(AUTH_USER_CACHE_KEY)
      safeRemove(AUTH_USER_CACHE_VALIDATED_KEY)
      setTokenState(null)
      setUser(null)
      await refreshUser()
      return
    }

    if (effectiveToken === DEMO_TOKEN_VALUE) {
      const userExplicitlyEnabledDemo = safeGet(STORAGE_KEY_DEMO_MODE) === 'true'
      if (!userExplicitlyEnabledDemo) {
        const { backendUp, oauthConfigured } = await checkOAuthConfigured()
        if (backendUp) {
          if (!oauthConfigured) { setDemoMode(); return }
          clearStoredAuthToken()
          cacheUser(null)
          setTokenState(null)
          setUser(null)
          return
        }
      }
      setDemoMode()
      return
    }

    try {
      const meResponse = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${effectiveToken}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (meResponse.status === 429) {
        const cachedUser = getCachedUser()
        if (cachedUser) {
          console.warn('Backend rate-limited (429), using cached user data')
          setUser(prev => {
            if (prev && prev.id === cachedUser.id && prev.github_login === cachedUser.github_login) return prev
            return cachedUser
          })
          setAnalyticsUserId(cachedUser.id)
          return
        }
      }
      if (!meResponse.ok) throw new Error(`/api/me returned ${meResponse.status}`)
      const rawMe = await meResponse.json().catch(() => null)
      const userData = validateResponse(UserSchema, rawMe, '/api/me') as User | null
      if (!userData) throw new Error('Invalid JSON from /api/me')
      setUser(prev => {
        if (prev && prev.id === userData.id && prev.github_id === userData.github_id &&
            prev.github_login === userData.github_login && prev.email === userData.email &&
            prev.avatar_url === userData.avatar_url && prev.role === userData.role &&
            prev.onboarded === userData.onboarded && prev.slack_id === userData.slack_id) {
          return prev
        }
        return userData
      })
      cacheUser(userData)
      try { localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true') } catch { /* quota */ }
      try { localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now())) } catch { /* quota */ }
      setAnalyticsUserId(userData.id)
      setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
      emitDeveloperSession()
    } catch (error: unknown) {
      const cachedUser = getCachedUser()
      const validatedAtRaw = (() => {
        try { return localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch { return null }
      })()
      const validatedAt = validatedAtRaw ? Number(validatedAtRaw) : 0
      const cacheAge = validatedAt ? Date.now() - validatedAt : Number.POSITIVE_INFINITY
      if (cachedUser && cacheAge <= MAX_CACHED_USER_AGE_MS) {
        console.warn('Backend unreachable, using cached user data (age ms):', cacheAge)
        setUser(prev => {
          if (prev && prev.id === cachedUser.id && prev.github_login === cachedUser.github_login) return prev
          return cachedUser
        })
        setAnalyticsUserId(cachedUser.id)
        setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
        return
      }
      console.error('Failed to fetch user (cache stale or missing), dropping to login:', error)
      clearStoredAuthToken()
      localStorage.removeItem(AUTH_USER_CACHE_KEY)
      localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY)
      setTokenState(null)
      setUser(null)
    }
  }, [setDemoMode])

  const login = useCallback(async (opts?: LoginOptions) => {
    const explicitDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    let backendUp = false
    let oauthConfigured = false
    let inCluster = false
    try {
      ({ backendUp, oauthConfigured, inCluster } = await checkOAuthConfigured())
    } catch { /* Backend unreachable */ }
    if (!opts?.preferDemo && !explicitDemoMode && backendUp && !oauthConfigured && inCluster) {
      emitLogin('dev-login')
      emitConversionStep(2, 'login', { method: 'dev-login' })
      redirectToDevLogin()
      return
    }
    const shouldUseDemoMode = explicitDemoMode || !backendUp || !oauthConfigured
    if (shouldUseDemoMode) {
      emitLogin('demo')
      emitConversionStep(2, 'login', { method: 'demo' })
      setDemoMode()
      return
    }
    emitLogin('github-oauth')
    emitConversionStep(2, 'login', { method: 'github-oauth' })
    window.location.href = '/auth/github'
  }, [setDemoMode])

  const setToken = useCallback((newToken: string, onboarded: boolean) => {
    setStoredAuthToken(newToken)
    setTokenState(newToken)
    cacheUser(null)
    setUser({ id: '', github_id: '', github_login: '', onboarded } as User)
  }, [])

  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return
    const checkExpiry = async () => {
      const currentToken = await getStoredAuthToken()
      if (!currentToken || currentToken === DEMO_TOKEN_VALUE) return
      const expiryMs = getJwtExpiryMs(currentToken)
      if (expiryMs === null) return
      const timeUntilExpiry = expiryMs - Date.now()
      if (timeUntilExpiry <= 0) {
        document.getElementById('session-expiry-warning')?.remove()
        await logout()
        return
      }
      if (timeUntilExpiry > EXPIRY_WARNING_THRESHOLD_MS) {
        document.getElementById('session-expiry-warning')?.remove()
        return
      }
      showExpiryWarningBanner(async () => {
        const freshToken = await getStoredAuthToken()
        if (!freshToken || freshToken === DEMO_TOKEN_VALUE) return
        try {
          const response = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (response.ok) {
            try { localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true') } catch { /* quota */ }
          } else {
            const HTTP_UNAUTHORIZED = 401
            const HTTP_FORBIDDEN = 403
            if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
              localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
            }
          }
        } catch (err: unknown) {
          emitSessionRefreshFailure(err instanceof Error ? err.message : 'network error')
        }
      })
    }
    checkExpiry()
    const intervalId = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, logout])

  useEffect(() => {
    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key !== AUTH_TOKEN_SYNC_KEY) return
      const syncState = parseAuthTokenSyncEvent(e.newValue)
      if (syncState === 'cleared') {
        setTokenState(null)
        setUser(null)
        cacheUser(null)
        try { localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch (error: unknown) {
          console.error('[auth] failed to clear cached user validation key:', error)
        }
        document.getElementById('session-expiry-warning')?.remove()
        if (!window.location.pathname.startsWith(ROUTES.LOGIN)) window.location.href = ROUTES.LOGIN
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
  }, [refreshUser])

  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return
    const intervalId = setInterval(() => {
      const validatedAtRaw = (() => {
        try { return localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch { return null }
      })()
      const validatedAt = validatedAtRaw ? Number(validatedAtRaw) : 0
      const cacheAge = validatedAt ? Date.now() - validatedAt : Number.POSITIVE_INFINITY
      const REVALIDATE_AGE_THRESHOLD_MS = MAX_CACHED_USER_AGE_MS / 2
      if (cacheAge >= REVALIDATE_AGE_THRESHOLD_MS) {
        refreshUser().catch(() => { /* refreshUser handles its own errors */ })
      }
    }, BACKEND_REVALIDATE_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, refreshUser])

  const authInitRef = useRef(false)
  const authRunCount = useRef(0)
  useEffect(() => {
    authRunCount.current++
    if (authRunCount.current > 3) {
      console.error('[AUTH DEBUG] refreshUser effect fired', authRunCount.current, 'times — likely infinite loop. authInitRef:', authInitRef.current)
      return
    }
    if (authInitRef.current) return
    authInitRef.current = true
    refreshUser().finally(() => setIsLoading(false))
  }, [refreshUser])

  const isAuthenticated = (() => {
    if (token === DEMO_TOKEN_VALUE) return true
    if (user) {
      try { if (localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true') return true } catch { /* unavailable */ }
    }
    if (token) return !isJWTExpired(token)
    return false
  })()

  const contextValue = useMemo<AuthContextType>(
    () => ({ user, token, isAuthenticated, isLoading, login, logout, setToken, refreshUser }),
    [user, token, isAuthenticated, isLoading, login, logout, setToken, refreshUser],
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

const AUTH_FALLBACK: AuthContextType = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  setToken: () => {},
  refreshUser: () => Promise.resolve(),
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useAuth was called outside AuthProvider — returning safe fallback')
    }
    return AUTH_FALLBACK
  }
  return context
}
