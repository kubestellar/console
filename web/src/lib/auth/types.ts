// Shared type definitions for the auth provider. Extracted from auth.tsx so
// the provider implementation file stays under the max-lines limit (tracked
// by #15790, split by #21605).

import type { LoginOptions } from '../devLogin'

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
  login: (opts?: LoginOptions) => void
  logout: () => void
  setToken: (token: string, onboarded: boolean) => void
  refreshUser: (overrideToken?: string) => Promise<void>
}
