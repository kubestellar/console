import { STORAGE_KEY_USER_CACHE, STORAGE_KEY_HAS_SESSION, DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS } from './constants'
import { clearStoredAuthToken, getStoredAuthToken, getStoredAuthTokenSync } from './authToken'
import { emitSessionExpired } from './analytics'
import { reportAppError } from './errors/handleError'

const API_BASE = ''
const SESSION_EXPIRY_REDIRECT_MS = 3_000
const TOKEN_REFRESH_HEADER = 'X-Token-Refresh'
const AUTH_LOGOUT_ENDPOINT = '/auth/logout'
const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']
const HANDLING_401_RESET_MS = 10_000
const SESSION_VERIFY_TIMEOUT_MS = 3_000
const AUTH_VERIFY_ENDPOINT = '/api/me'

let handling401 = false
let refreshInProgress: Promise<void> | null = null

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix => path.startsWith(prefix))
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  const token = await getStoredAuthToken()
  if (token) {
    headers.Authorization = 'Bearer ' + token
  }
  return headers
}

export async function hasAuthSession(): Promise<boolean> {
  const token = await getStoredAuthToken()
  if (token && token !== DEMO_TOKEN_VALUE) return true
  try {
    return localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true'
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] failed to read session marker',
      level: 'warn',
      fallbackMessage: 'session marker read failed',
    })
    return false
  }
}

function showSessionExpiredBanner(): void {
  if (document.getElementById('session-expired-banner')) return

  const toast = document.createElement('div')
  toast.id = 'session-expired-banner'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 99999;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px;
    background: rgba(234,179,8,0.15);
    border: 1px solid rgba(234,179,8,0.4);
    border-radius: 8px; backdrop-filter: blur(8px);
    color: #fbbf24; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  toast.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
    <span><strong>Session expired</strong> — Redirecting to sign in...</span>
  `

  const styleId = 'session-banner-animation'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = '@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }'
    document.head.appendChild(style)
  }
  document.body.appendChild(toast)
}

function performSessionExpiry(): void {
  reportAppError(new Error('[API] Received 401 Unauthorized - token invalid or expired, logging out'), {
    context: '[API]',
    level: 'warn',
  })

  showSessionExpiredBanner()
  emitSessionExpired()

  const expiredToken = getStoredAuthTokenSync()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (expiredToken && expiredToken !== DEMO_TOKEN_VALUE) {
      headers.Authorization = 'Bearer ' + expiredToken
    }
    fetch(`${API_BASE}${AUTH_LOGOUT_ENDPOINT}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }).catch((error: unknown) => {
      reportAppError(error, {
        context: '[API] Logout request failed during session expiry',
        level: 'warn',
        fallbackMessage: 'logout request failed',
      })
    })
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[API] Failed to initiate logout request during session expiry',
      level: 'warn',
      fallbackMessage: 'logout request setup failed',
    })
  }

  clearStoredAuthToken()
  localStorage.removeItem(STORAGE_KEY_USER_CACHE)
  localStorage.removeItem(STORAGE_KEY_HAS_SESSION)

  setTimeout(() => {
    window.location.href = '/login?reason=session_expired'
  }, SESSION_EXPIRY_REDIRECT_MS)
}

export function handleUnauthorizedResponse(): void {
  if (handling401) return
  handling401 = true

  setTimeout(() => {
    handling401 = false
  }, HANDLING_401_RESET_MS)

  fetch(`${API_BASE}${AUTH_VERIFY_ENDPOINT}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(SESSION_VERIFY_TIMEOUT_MS),
  }).then(verifyResponse => {
    if (verifyResponse.ok) {
      reportAppError(new Error('[API] 401 received but /api/me still 200 — endpoint-specific failure, keeping session'), {
        context: '[API]',
        level: 'warn',
      })
      handling401 = false
      return
    }
    if (verifyResponse.status === 429) {
      reportAppError(new Error('[API] 401 received but /api/me returned 429 (rate-limited) — keeping session'), {
        context: '[API]',
        level: 'warn',
      })
      handling401 = false
      return
    }
    performSessionExpiry()
  }).catch((error: unknown) => {
    reportAppError(error, {
      context: '[API] Session verify probe failed during 401 handling',
      level: 'warn',
      fallbackMessage: 'session verify probe failed',
    })
    performSessionExpiry()
  })
}

async function silentRefresh(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'same-origin',
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (response.ok) {
    try {
      localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] failed to cache session marker after refresh',
        level: 'warn',
        fallbackMessage: 'session marker cache write failed',
      })
    }
  }
}

export function checkTokenRefresh(response: Response): void {
  if (response.headers.get(TOKEN_REFRESH_HEADER) !== 'true' || refreshInProgress) {
    return
  }

  refreshInProgress = (async () => {
    try {
      await silentRefresh()
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] silent refresh failed',
        level: 'warn',
        fallbackMessage: 'token refresh failed',
      })
    } finally {
      refreshInProgress = null
    }
  })()
}
