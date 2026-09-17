// Auth hook extracted from ../auth.tsx as part of the auth.tsx file split
// (#22976, part of #22962). No behaviour change — this is the same
// useAuth() implementation that previously lived in auth.tsx.

import { use } from 'react'
import { AuthContext } from './context'
import type { AuthContextType } from './types'

/**
 * Safe fallback for when useAuth is called outside AuthProvider.
 *
 * This can happen transiently during error-boundary recovery, stale chunk
 * re-evaluation, or KeepAlive route transitions.  Rather than throwing
 * (which triggers cascading GA4 runtime errors), return a "loading" stub
 * so the UI shows a spinner until the provider tree re-mounts.
 */
const AUTH_FALLBACK: AuthContextType = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  setToken: () => {},
  refreshUser: () => Promise.resolve() }

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
