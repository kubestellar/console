import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, checkBackendAvailability, checkOAuthConfigured } from './api'
import { dashboardSync } from './dashboards/dashboardSync'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_ONBOARDED, STORAGE_KEY_USER_CACHE } from './constants'
import { trackLogin, trackLogout } from './analytics'

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
    trackLogout()
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
    } catch (error) {
      // If the backend is temporarily unreachable but we have a real token,
      // keep the token and use cached user data instead of destroying the
      // session by falling back to demo mode.
      const cachedUser = getCachedUser()
      if (cachedUser) {
        console.warn('Backend unreachable, using cached user data')
        setUser(cachedUser)
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
      trackLogin('demo')
      setDemoMode()
      return
    }
    trackLogin('github-oauth')
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
