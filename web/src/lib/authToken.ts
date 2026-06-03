import { DEMO_TOKEN_VALUE, STORAGE_KEY_TOKEN } from './constants/storage'

export const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

type AuthTokenSyncState = 'cleared' | 'demo' | 'session'

interface AuthTokenSyncEvent {
  state: AuthTokenSyncState
  ts: number
}

let inMemoryAuthToken: string | null = null

function readSessionAuthToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY_TOKEN)
  } catch {
    return null
  }
}

function readLocalAuthToken(): string | null {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    return token === DEMO_TOKEN_VALUE ? token : null
  } catch {
    return null
  }
}

function writeAuthTokenSyncEvent(state: AuthTokenSyncState): void {
  try {
    localStorage.setItem(AUTH_TOKEN_SYNC_KEY, JSON.stringify({ state, ts: Date.now() } satisfies AuthTokenSyncEvent))
  } catch {
    // localStorage may be unavailable in embedded contexts.
  }
}

export function getStoredAuthToken(): string | null {
  if (inMemoryAuthToken !== null) {
    return inMemoryAuthToken
  }

  const sessionToken = readSessionAuthToken()
  if (sessionToken) {
    inMemoryAuthToken = sessionToken
    return sessionToken
  }

  const localToken = readLocalAuthToken()
  if (localToken) {
    inMemoryAuthToken = localToken
    return localToken
  }

  return null
}

export function setStoredAuthToken(token: string | null): void {
  inMemoryAuthToken = token

  try {
    if (token && token !== DEMO_TOKEN_VALUE) {
      sessionStorage.setItem(STORAGE_KEY_TOKEN, token)
    } else {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN)
    }
  } catch {
    // sessionStorage may be unavailable in embedded contexts.
  }

  try {
    if (token === DEMO_TOKEN_VALUE) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token)
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN)
    }
  } catch {
    // localStorage may be unavailable in embedded contexts.
  }

  if (token === DEMO_TOKEN_VALUE) {
    writeAuthTokenSyncEvent('demo')
  } else if (token) {
    writeAuthTokenSyncEvent('session')
  } else {
    writeAuthTokenSyncEvent('cleared')
  }
}

export function clearStoredAuthToken(): void {
  setStoredAuthToken(null)
}

export function parseAuthTokenSyncEvent(rawValue: string | null): AuthTokenSyncState | null {
  if (!rawValue) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthTokenSyncEvent>
    if (parsed.state === 'cleared' || parsed.state === 'demo' || parsed.state === 'session') {
      return parsed.state
    }
  } catch {
    return null
  }
  return null
}
