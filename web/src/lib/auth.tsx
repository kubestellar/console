import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, checkBackendAvailability, checkOAuthConfigured } from './api'
import { dashboardSync } from './dashboards/dashboardSync'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_ONBOARDED, STORAGE_KEY_USER_CACHE } from './constants'
import { emitLogin, emitLogout, setAnalyticsUserId, setAnalyticsUserProperties, emitConversionStep } from './analytics'

interface User {
  id: string
  github_id: string
  github_login: string
  email?: string
  slackId?: string
  avatar_url?: string
  role?: 'admin' | 'editor' | 'viewer'
  onboarded: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => void
  setToken: (token: string, onboarded: boolean) => void
  refreshUser: (overrideToken?: string) => Promise<void>
}

const AUTH_USER_CACHE_KEY = STORAGE_KEY_USER_CACHE

// How often (in ms) to check if the JWT is nearing expiry
const EXPIRY_CHECK_INTERVAL_MS = 60_000
// Show a warning banner when the token expires within this many ms
const EXPIRY_WARNING_THRESHOLD_MS = 30 * 60_000

/**
 * Decode the expiry timestamp from a JWT without verifying signature.
 * Returns the `exp` value in ms, or null if the token isn't decodable.
 */
function getJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // JWT uses base64url encoding — convert to standard base64 for atob()
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return null
    const MS_PER_SECOND = 1000
    return payload.exp * MS_PER_SECOND
  } catch {
    return null
  }
}

/**
 * Inject a DOM-based warning banner when the session is about to expire.
 * The user can click "Refresh Now" to silently renew their token.
 */
function showExpiryWarningBanner(onRefresh: () => void): void {
  if (document.getElementById('session-expiry-warning')) return

  const banner = document.createElement('div')
  banner.id = 'session-expiry-warning'
  banner.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 99999;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px;
    background: rgba(234,179,8,0.15);
    border: 1px solid rgba(234,179,8,0.4);
    border-radius: 8px; backdrop-filter: blur(8px);
    color: #fbbf24; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span><strong>Session expires soon</strong></span>
  `

  const btn = document.createElement('button')
  btn.textContent = 'Refresh Now'
  btn.style.cssText = `
    margin-left: 8px; padding: 4px 12px; border-radius: 6px;
    background: rgba(234,179,8,0.3); border: 1px solid rgba(234,179,8,0.5);
    color: #fbbf24; cursor: pointer; font-size: 13px; font-family: inherit;
  `
  btn.onclick = () => {
    onRefresh()
    banner.remove()
  }
  banner.appendChild(btn)

  // Reuse a single <style> element for the slideUp animation to avoid unbounded DOM growth
  const STYLE_ID = 'session-banner-animation'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`
    document.head.appendChild(style)
  }
  document.body.appendChild(banner)
}

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

function cacheUser(userData: User | null) {
  if (userData) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(userData))
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
  }
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCachedUser)
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY_TOKEN)
  )
  // Skip loading if we have both a token and a cached user (stale-while-revalidate)
  const [isLoading, setIsLoading] = useState(() => {
    return !!localStorage.getItem(STORAGE_KEY_TOKEN) && !getCachedUser()
  })

  const logout = useCallback(() => {
    emitLogout()
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    cacheUser(null)
    setTokenState(null)
    setUser(null)
    // Clear dashboard sync cache
    dashboardSync.clearCache()
  }, [])

  const setDemoMode = useCallback(() => {
    const isNetlifyPreview = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('netlify.app') ||
      window.location.hostname.includes('deploy-preview-')
    const demoOnboarded = isNetlifyPreview || localStorage.getItem(STORAGE_KEY_ONBOARDED) === 'true'
    localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
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
    setAnalyticsUserProperties({ auth_mode: 'demo' })
  }, [])

  const refreshUser = useCallback(async (overrideToken?: string) => {
    const effectiveToken = overrideToken || localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!effectiveToken) {
      setDemoMode()
      return
    }

    // Demo token — check if the backend has come online since the token was issued.
    // If the user explicitly enabled demo mode (via the toggle), keep it even if
    // the backend is available. Otherwise, clear the stale demo token so the user
    // can authenticate with a real JWT.
    if (effectiveToken === DEMO_TOKEN_VALUE) {
      const userExplicitlyEnabledDemo = localStorage.getItem(STORAGE_KEY_DEMO_MODE) === 'true'
      if (!userExplicitlyEnabledDemo) {
        const { backendUp, oauthConfigured } = await checkOAuthConfigured()
        if (backendUp) {
          if (!oauthConfigured) {
            // No OAuth — auto-login to get a real dev-user JWT
            window.location.href = '/auth/github'
            return
          }
          // OAuth configured — clear demo token so login page appears
          localStorage.removeItem(STORAGE_KEY_TOKEN)
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
      const response = await api.get('/api/me', {
        headers: { Authorization: `Bearer ${effectiveToken}` }
      })
      setUser(response.data)
      cacheUser(response.data)
      // Set anonymous analytics ID (SHA-256 hash — no PII)
      setAnalyticsUserId(response.data.id)
      setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
    } catch (error) {
      // If the backend is temporarily unreachable but we have a real token,
      // keep the token and use cached user data instead of destroying the
      // session by falling back to demo mode.
      const cachedUser = getCachedUser()
      if (cachedUser) {
        console.warn('Backend unreachable, using cached user data')
        setUser(cachedUser)
        setAnalyticsUserId(cachedUser.id)
        setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
        return
      }
      // No cached user — fall back to demo mode as last resort
      console.error('Failed to fetch user and no cache, falling back to demo mode:', error)
      setDemoMode()
    }
  }, [setDemoMode])

  const login = useCallback(async () => {
    // Demo mode enabled via:
    // 1. Explicit environment variable VITE_DEMO_MODE=true
    // 2. Netlify deploy previews (deploy-preview-* hostnames) - safe because these are ephemeral test environments
    // 3. Backend is unavailable (graceful fallback for local development)
    const explicitDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')

    // Check backend availability (async, force fresh check) - this ensures we don't redirect to broken OAuth
    const backendAvailable = await checkBackendAvailability(true)
    const isDemoMode = explicitDemoMode || !backendAvailable

    if (isDemoMode) {
      emitLogin('demo')
      emitConversionStep(2, 'login', { method: 'demo' })
      setDemoMode()
      return
    }
    emitLogin('github-oauth')
    emitConversionStep(2, 'login', { method: 'github-oauth' })
    window.location.href = '/auth/github'
  }, [])

  const setToken = useCallback((newToken: string, onboarded: boolean) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken)
    setTokenState(newToken)
    // Clear stale cached user — refreshUser() will fetch and cache real data.
    // Do NOT cache the temp user: if refreshUser fails, the empty-field temp
    // user persists in localStorage and the profile shows "No email set".
    cacheUser(null)
    setUser({ id: '', github_id: '', github_login: '', onboarded } as User)
  }, [])

  // Periodically check if the JWT is nearing expiry and show a warning banner.
  // When the user clicks "Refresh Now", silently call /auth/refresh for a new token.
  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return

    const checkExpiry = () => {
      const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!currentToken || currentToken === DEMO_TOKEN_VALUE) return

      const expiryMs = getJwtExpiryMs(currentToken)
      if (expiryMs === null) return

      const timeUntilExpiry = expiryMs - Date.now()
      if (timeUntilExpiry <= 0 || timeUntilExpiry > EXPIRY_WARNING_THRESHOLD_MS) {
        // Token not near expiry (or already expired) — remove stale banner if present
        document.getElementById('session-expiry-warning')?.remove()
        return
      }
      showExpiryWarningBanner(async () => {
        try {
          const response = await fetch('/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentToken}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            if (data.token) {
              localStorage.setItem(STORAGE_KEY_TOKEN, data.token)
              setTokenState(data.token)
            }
          }
        } catch {
          // Refresh failed — user will see session-expired redirect naturally
        }
      })
    }

    // Check once immediately, then every 60 seconds
    checkExpiry()
    const intervalId = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token])

  // Listen for token updates from silentRefresh() (dispatched via StorageEvent)
  // so the AuthProvider state stays in sync without a full page reload.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_TOKEN && e.newValue && e.newValue !== DEMO_TOKEN_VALUE) {
        setTokenState(e.newValue)
        // Remove the expiry warning banner since the token was just refreshed
        document.getElementById('session-expiry-warning')?.remove()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  useEffect(() => {
    if (token) {
      refreshUser().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, []) // Empty deps - only run on mount

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        setToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
