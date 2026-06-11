import { DEMO_TOKEN_VALUE, STORAGE_KEY_TOKEN } from './constants/storage'
import { clearToken, getToken, setToken } from './secureTokenStore'

export const AUTH_TOKEN_SYNC_KEY = 'kc-auth-token-sync'
const LEGACY_TEST_STORAGE_KEYS = [STORAGE_KEY_TOKEN, 'kc_token'] as const

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
}

function readLegacyTestAuthToken(storage: Storage): string | null {
  if (!isTestEnvironment()) {
    return null
  }

  try {
    for (const key of LEGACY_TEST_STORAGE_KEYS) {
      const token = storage.getItem(key)?.trim()
      if (token) {
        return token
      }
    }
  } catch {
    return null
  }

  return null
}

type AuthTokenSyncState = 'cleared' | 'demo' | 'session'

interface AuthTokenSyncEvent {
  state: AuthTokenSyncState
  ts: number
}

let inMemorySessionToken: string | null = null
let inMemoryDemoToken: string | null = null

async function readSessionAuthToken(): Promise<string | null> {
  try {
    const token = await getToken(STORAGE_KEY_TOKEN, sessionStorage)
    return token ?? readLegacyTestAuthToken(sessionStorage)
  } catch {
    return inMemorySessionToken ?? readLegacyTestAuthToken(sessionStorage)
  }
}

async function readLocalAuthToken(): Promise<string | null> {
  try {
    const token = await getToken(STORAGE_KEY_TOKEN, localStorage)
    if (token) return token

    return readLegacyTestAuthToken(localStorage)
  } catch {
    return inMemoryDemoToken ?? readLegacyTestAuthToken(localStorage)
  }
}

async function writeSessionAuthToken(token: string | null): Promise<void> {
  try {
    if (token && token !== DEMO_TOKEN_VALUE) {
      await setToken(STORAGE_KEY_TOKEN, token, undefined, sessionStorage)
    } else {
      clearToken(STORAGE_KEY_TOKEN, sessionStorage)
    }
    inMemorySessionToken = null
  } catch {
    inMemorySessionToken = token && token !== DEMO_TOKEN_VALUE ? token : null
  }
}

async function writeLocalAuthToken(token: string | null): Promise<void> {
  try {
    if (token === DEMO_TOKEN_VALUE) {
      await setToken(STORAGE_KEY_TOKEN, token, undefined, localStorage)
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

/**
 * Synchronous version of getStoredAuthToken for use in useState initialization
 * and other sync contexts. Returns in-memory cache or legacy test tokens only.
 * For full async token retrieval with crypto verification, use getStoredAuthToken().
 */
export function getStoredAuthTokenSync(): string | null {
  // Try in-memory cache first
  if (inMemorySessionToken) {
    return inMemorySessionToken
  }
  if (inMemoryDemoToken) {
    return inMemoryDemoToken
  }

  // Fall back to legacy test tokens (test environment only)
  try {
    const sessionToken = readLegacyTestAuthToken(sessionStorage)
    if (sessionToken) {
      return sessionToken
    }
    return readLegacyTestAuthToken(localStorage)
  } catch {
    return null
  }
}

export async function getStoredAuthToken(): Promise<string | null> {
  const sessionToken = await readSessionAuthToken()
  if (sessionToken) {
    return sessionToken
  }

  const localToken = await readLocalAuthToken()
  if (localToken) {
    return localToken
  }

  return null
}

export async function setStoredAuthToken(token: string | null): Promise<void> {
  await writeSessionAuthToken(token)
  await writeLocalAuthToken(token)

  if (token === DEMO_TOKEN_VALUE) {
    writeAuthTokenSyncEvent('demo')
  } else if (token) {
    writeAuthTokenSyncEvent('session')
  } else {
    writeAuthTokenSyncEvent('cleared')
  }
}

export async function clearStoredAuthToken(): Promise<void> {
  await setStoredAuthToken(null)
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
