import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api } from './api'

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

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem('token')
  )
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setTokenState(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async (overrideToken?: string) => {
    const effectiveToken = overrideToken || localStorage.getItem('token')
    if (!effectiveToken) return
    try {
      const response = await api.get('/api/me', {
        headers: { Authorization: `Bearer ${effectiveToken}` }
      })
      setUser(response.data)
    } catch (error) {
      console.error('Failed to fetch user:', error)
      logout()
    }
  }, [logout])

  const login = useCallback(() => {
    // In demo mode, bypass OAuth and set mock credentials directly
    // Check env var OR detect Netlify domain (for when env var isn't set)
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('netlify.app')

    if (isDemoMode) {
      localStorage.setItem('token', 'demo-token')
      setTokenState('demo-token')
      setUser({
        id: 'demo-user',
        github_id: '12345',
        github_login: 'demo-user',
        email: 'demo@example.com',
        avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
        role: 'admin',
        onboarded: true,
      })
      return
    }
    window.location.href = '/auth/github'
  }, [])

  const setToken = useCallback((newToken: string, onboarded: boolean) => {
    localStorage.setItem('token', newToken)
    setTokenState(newToken)
    // Set temporary user until we fetch full user data
    setUser({ id: '', github_id: '', github_login: '', onboarded })
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
