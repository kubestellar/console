/**
 * Session and auth-error handling: 401/429 handling, session expiry banner,
 * and logout flow.
 * Split from api.ts (tracked by #21384 / #21375).
 */
import { FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_USER_CACHE, STORAGE_KEY_HAS_SESSION, DEMO_TOKEN_VALUE } from '../constants'
import { clearStoredAuthToken, getStoredAuthTokenSync } from '../authToken'
import { emitSessionExpired } from '../analytics'
import { reportAppError } from '../errors/handleError'
import { ROUTES } from '../../config/routes'
import { RateLimitError } from './types'
import { AUTH_LOGOUT_ENDPOINT, AUTH_VERIFY_ENDPOINT } from './endpoints'

const API_BASE = ''
/** Delay before redirecting to login after session expiry (lets user see the banner) */
const SESSION_EXPIRY_REDIRECT_MS = 3_000
const TOAST_Z_INDEX = 99_999

/** Default Retry-After when the header is missing or unparseable. */
const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60
/** localStorage key for global API rate-limit backoff deadline (epoch ms). */
const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'

/** Debounce flag — prevents multiple simultaneous logout flows. */
export let handling401 = false
/** Safety cap: reset the 401 debounce flag after this many ms so future
 *  auth failures aren't permanently silenced if the redirect doesn't fire (#3899). */
const HANDLING_401_RESET_MS = 10_000
/** Short timeout on the session-verify probe so a hung backend doesn't block
 *  the session-expired UI indefinitely (#8372). */
const SESSION_VERIFY_TIMEOUT_MS = 3_000

export function handle429(response: Response): never {
  const retryAfterRaw = response.headers.get('Retry-After')
  const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  const effectiveRetry = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  try {
    localStorage.setItem(STORAGE_KEY_RATE_LIMIT_UNTIL,
      String(Date.now() + effectiveRetry * 1000))
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[API] Failed to persist rate-limit retry window',
      level: 'warn',
      fallbackMessage: 'rate limit storage write failed',
    })
  }
  throw new RateLimitError(effectiveRetry)
}

/**
 * Handle 401 Unauthorized responses by clearing auth state and redirecting to login.
 * This is debounced to avoid multiple simultaneous logouts from parallel API calls.
 * The flag auto-resets after HANDLING_401_RESET_MS so a failed redirect doesn't
 * permanently block all API calls.
 *
 * Before nuking the session we re-verify via /api/me. If the cookie-based
 * session is still valid, the 401 was specific to the originating endpoint
 * (e.g. a route that requires elevated scope, or a backend race) and we must
 * NOT show "Session expired" nor redirect — doing so would bounce the user
 * through /login?reason=session_expired and leave a stale `?reason=…` query
 * param on the landing page (#8372).
 */
export function handle401(): void {
  if (handling401) return
  handling401 = true

  // Auto-reset the flag after a safety timeout so the app isn't permanently
  // blocked if the redirect fails (e.g. service-worker intercept, popup blocker).
  setTimeout(() => {
    handling401 = false
  }, HANDLING_401_RESET_MS)

  // Verify the cookie-based session before treating this as an expiry. If
  // /api/me comes back 200, the session is still valid — abort the
  // session-expired flow entirely (#8372).
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
    // Verify probe failed (network error / timeout / no backend). Treat the
    // 401 as authoritative and run the normal expiry flow.
    performSessionExpiry()
  })
}

/** Second half of handle401: banner + cookie invalidation + redirect. */
export function performSessionExpiry(): void {
  reportAppError(new Error('[API] Received 401 Unauthorized - token invalid or expired, logging out'), {
    context: '[API]',
    level: 'warn',
  })

  // Show an in-page notification before redirecting (DOM-injected, no React dependency)
  showSessionExpiredBanner()

  emitSessionExpired()

  // Fire-and-forget: invalidate the HttpOnly auth cookie on the server so that
  // a stale cookie doesn't resurrect the session on the next page load (#6061).
  // We pass credentials:'include' so the browser sends the cookie. We don't
  // await the response and we ignore failures — the client-side clear below
  // is the source of truth for logout.
  const expiredToken = getStoredAuthTokenSync()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (expiredToken && expiredToken !== DEMO_TOKEN_VALUE) {
      headers['Authorization'] = `Bearer ${expiredToken}`
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
      // Backend unreachable — cookie will expire naturally
    })
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[API] Failed to initiate logout request during session expiry',
      level: 'warn',
      fallbackMessage: 'logout request setup failed',
    })
    // fetch() threw synchronously (very rare) — ignore
  }

  // Clear auth state
  clearStoredAuthToken()
  localStorage.removeItem(STORAGE_KEY_USER_CACHE)
  localStorage.removeItem(STORAGE_KEY_HAS_SESSION)

  // Redirect to login after a delay so the user sees the banner
  setTimeout(() => {
    window.location.href = `${ROUTES.LOGIN}?reason=session_expired`
  }, SESSION_EXPIRY_REDIRECT_MS)
}

/**
 * Inject a DOM-based notification banner for session expiry.
 * This runs outside React so it works from any context (API client, background fetches, etc).
 */
export function showSessionExpiredBanner(): void {
  // Avoid duplicates
  if (document.getElementById('session-expired-banner')) return

  const toast = document.createElement('div')
  toast.id = 'session-expired-banner'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: ${TOAST_Z_INDEX};
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

  // Reuse a single <style> element to avoid unbounded DOM growth
  const STYLE_ID = 'session-banner-animation'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`
    document.head.appendChild(style)
  }
  document.body.appendChild(toast)
}

/** Reset session-module state for tests. */
export function resetSessionStateForTests(): void {
  handling401 = false
}
