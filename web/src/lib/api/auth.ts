import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_HAS_SESSION, STORAGE_KEY_USER_CACHE } from '../constants'
import { clearStoredAuthToken, getStoredAuthTokenSync } from '../authToken'
import { emitSessionExpired } from '../analytics'
import { reportAppError } from '../errors/handleError'
import {
  API_BASE,
  AUTH_LOGOUT_ENDPOINT,
  AUTH_VERIFY_ENDPOINT,
  BACKEND_HEALTH_TIMEOUT_MS,
  HANDLING_401_RESET_MS,
  OAUTH_STARTUP_RETRY_ATTEMPTS,
  OAUTH_STARTUP_RETRY_DELAY_MS,
  SESSION_EXPIRY_REDIRECT_MS,
  SESSION_VERIFY_TIMEOUT_MS,
} from './config'
import { safeParseJsonOrNull } from './utils'

let handling401 = false

export function handle401(): void {
  if (handling401) return
  handling401 = true

  setTimeout(() => {
    handling401 = false
  }, HANDLING_401_RESET_MS)

  fetch(`${API_BASE}${AUTH_VERIFY_ENDPOINT}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(SESSION_VERIFY_TIMEOUT_MS),
  }).then(verifyResponse => {
    if (verifyResponse.ok || verifyResponse.status === 429) {
      reportAppError(new Error(
        verifyResponse.ok
          ? '[API] 401 received but /api/me still 200 — endpoint-specific failure, keeping session'
          : '[API] 401 received but /api/me returned 429 (rate-limited) — keeping session',
      ), {
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

export async function checkOAuthConfiguredWithRetry(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  let lastResult = { backendUp: false, oauthConfigured: false }

  for (let attempt = 0; attempt < OAUTH_STARTUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await checkOAuthConfigured()
      lastResult = result
      if (result.backendUp) {
        return result
      }
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] OAuth startup check failed; retrying',
        level: 'warn',
        fallbackMessage: 'oauth startup check failed',
      })
    }

    if (attempt < OAUTH_STARTUP_RETRY_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, OAUTH_STARTUP_RETRY_DELAY_MS))
    }
  }

  return lastResult
}

export async function checkOAuthConfigured(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { backendUp: false, oauthConfigured: false }
    }

    const data = await safeParseJsonOrNull<{ oauth_configured?: boolean }>(
      response,
      '[api] /health OAuth config parse failed',
    )
    if (!data) {
      return { backendUp: false, oauthConfigured: false }
    }

    return {
      backendUp: true,
      oauthConfigured: !!data.oauth_configured,
    }
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] OAuth configured check failed',
      level: 'warn',
      fallbackMessage: 'oauth configured check failed',
    })
    return { backendUp: false, oauthConfigured: false }
  }
}
