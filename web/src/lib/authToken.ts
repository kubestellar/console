import { DEMO_TOKEN_VALUE, STORAGE_KEY_TOKEN } from './constants/storage'
import { clearToken, getToken, setToken } from './secureTokenStore'

export const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'

type AuthTokenSyncState = 'cleared' | 'demo' | 'session'

interface AuthTokenSyncEvent {
  state: AuthTokenSyncState
  ts: number
}

let inMemorySessionToken: string | null = null
let inMemoryDemoToken: string | null = null

function readSessionAuthToken(): string | null {
  try {
    return getToken(STORAGE_KEY_TOKEN, sessionStorage)
  } catch {
    return inMemorySessionToken
  }
}

function readLocalAuthToken(): string | null {
  try {
    const token = getToken(STORAGE_KEY_TOKEN, localStorage)
    return token === DEMO_TOKEN_VALUE ? token : null
  } catch {
    return inMemoryDemoToken
  }
}

function writeSessionAuthToken(token: string | null): void {
  try {
    if (token && token !== DEMO_TOKEN_VALUE) {
      setToken(STORAGE_KEY_TOKEN, token, undefined, sessionStorage)
    } else {
      clearToken(STORAGE_KEY_TOKEN, sessionStorage)
    }
    inMemorySessionToken = null
  } catch {
    inMemorySessionToken = token && token !== DEMO_TOKEN_VALUE ? token : null
  }
}

function writeLocalAuthToken(token: string | null): void {
  try {
    if (token === DEMO_TOKEN_VALUE) {
      setToken(STORAGE_KEY_TOKEN, token, undefined, localStorage)
    } else {
      clearToken(STORAGE_KEY_TOKEN, localStorage)
    }
    inMemoryDemoToken = null
  } catch {
    inMemoryDemoToken = token === DEMO_TOKEN_VALUE ? token : null
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
  const sessionToken = readSessionAuthToken()
  if (sessionToken) {
    return sessionToken
  }

  const localToken = readLocalAuthToken()
  if (localToken) {
    return localToken
  }

  return null
}

export function setStoredAuthToken(token: string | null): void {
  writeSessionAuthToken(token)
  writeLocalAuthToken(token)

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
