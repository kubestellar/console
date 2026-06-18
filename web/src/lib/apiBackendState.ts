import { BACKEND_HEALTH_CHECK_TIMEOUT_MS, DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_HAS_SESSION, STORAGE_KEY_USER_CACHE } from './constants'
import { clearStoredAuthToken, getStoredAuthTokenSync } from './authToken'
import { emitSessionExpired } from './analytics'
import { reportBackendAvailable, reportBackendUnavailable, shouldMarkBackendUnavailable } from './backendHealthEvents'
import { reportAppError } from './errors/handleError'

export const API_BASE = ''
export const DEFAULT_TIMEOUT = 30_000
export const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']
export const TOKEN_REFRESH_HEADER = 'X-Token-Refresh'
export const BACKEND_OUTAGE_EXEMPT_PREFIXES = ['/api/kagent/', '/api/kagenti-provider/']
const BACKEND_CHECK_INTERVAL = 10_000
const BACKEND_CACHE_TTL_MS = 300_000
const SESSION_EXPIRY_REDIRECT_MS = 3_000
const AUTH_LOGOUT_ENDPOINT = '/auth/logout'
const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'
const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60
const HANDLING_401_RESET_MS = 10_000
const SESSION_VERIFY_TIMEOUT_MS = 3_000
const AUTH_VERIFY_ENDPOINT = '/api/me'
const BACKEND_STATUS_KEY = 'kc-backend-status'

export class UnauthenticatedError extends Error {
  constructor() {
    super('No authentication token available')
    this.name = 'UnauthenticatedError'
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Token is invalid or expired')
    this.name = 'UnauthorizedError'
  }
}

export class RateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter: number) {
    super(`Rate limited. Try again in ${retryAfter} seconds.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

export class BackendUnavailableError extends Error {
  constructor() {
    super('Backend API is currently unavailable')
    this.name = 'BackendUnavailableError'
  }
}

let handling401 = false
let backendLastCheckTime = 0
let backendAvailable: boolean | null = null
let backendCheckPromise: Promise<boolean> | null = null

export function handle429(response: Response): never {
  const retryAfterRaw = response.headers.get('Retry-After')
  const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  const effectiveRetry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  try {
    localStorage.setItem(STORAGE_KEY_RATE_LIMIT_UNTIL, String(Date.now() + effectiveRetry * 1000))
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[API] Failed to persist rate-limit retry window',
      level: 'warn',
      fallbackMessage: 'rate limit storage write failed',
    })
  }
  throw new RateLimitError(effectiveRetry)
}

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
      handling401 = false
      return
    }
    performSessionExpiry()
  }).catch(() => {
    performSessionExpiry()
  })
}

function performSessionExpiry(): void {
  showSessionExpiredBanner()
  emitSessionExpired()

  const expiredToken = getStoredAuthTokenSync()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (expiredToken && expiredToken !== DEMO_TOKEN_VALUE) {
      // keep cookie logout path even when token is present
    }
    fetch(`${API_BASE}${AUTH_LOGOUT_ENDPOINT}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }).catch(() => {})
  } catch {
    // ignore
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
  toast.innerHTML = '<span><strong>Session expired</strong> — Redirecting to sign in...</span>'
  document.body.appendChild(toast)
}

try {
  const stored = localStorage.getItem(BACKEND_STATUS_KEY)
  if (stored) {
    const { available, timestamp } = JSON.parse(stored)
    if (Date.now() - timestamp < BACKEND_CACHE_TTL_MS) {
      backendAvailable = available
      backendLastCheckTime = timestamp
    }
  }
} catch {
  // ignore
}

export async function checkBackendAvailability(forceCheck = false): Promise<boolean> {
  if (!forceCheck && backendAvailable !== null) {
    const now = Date.now()
    if (now - backendLastCheckTime < BACKEND_CHECK_INTERVAL) {
      return backendAvailable
    }
  }

  if (backendCheckPromise) {
    return backendCheckPromise
  }

  backendCheckPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
      })
      backendAvailable = response.status < 500
      backendLastCheckTime = Date.now()
      try {
        localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
          available: backendAvailable,
          timestamp: backendLastCheckTime,
        }))
      } catch {
        // ignore
      }
      return backendAvailable
    } catch {
      backendAvailable = false
      backendLastCheckTime = Date.now()
      return false
    } finally {
      backendCheckPromise = null
    }
  })()

  return backendCheckPromise
}

export function markBackendFailure(status?: number): void {
  backendAvailable = false
  backendLastCheckTime = Date.now()
  reportBackendUnavailable('http', status)
  try {
    localStorage.removeItem(BACKEND_STATUS_KEY)
  } catch {
    // ignore
  }
}

export function markBackendSuccess(status?: number): void {
  backendAvailable = true
  backendLastCheckTime = Date.now()
  reportBackendAvailable('http', status)
  try {
    localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
      available: true,
      timestamp: backendLastCheckTime,
    }))
  } catch {
    // ignore
  }
}

export function createErrorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown }
  error.cause = cause
  return error
}

export async function safeReadTextOrEmpty(response: Response, context: string): Promise<string> {
  try {
    return await response.text()
  } catch (error: unknown) {
    reportAppError(error, {
      context,
      level: 'warn',
      fallbackMessage: 'failed to read response text',
    })
    return ''
  }
}

export async function safeParseJsonOrNull<T = unknown>(response: Response, context: string): Promise<T | null> {
  const contentLength = response.headers.get('content-length')

  if (response.status === 204 || contentLength === '0') {
    return {} as T
  }

  try {
    const text = await response.text()
    if (!text || text.trim() === '') {
      return {} as T
    }
    return JSON.parse(text) as T
  } catch (error: unknown) {
    reportAppError(error, {
      context,
      level: 'warn',
      fallbackMessage: 'failed to parse response JSON',
    })
    return null
  }
}

export function isBackendUnavailable(): boolean {
  if (backendAvailable === null || backendAvailable) return false
  const now = Date.now()
  if (now - backendLastCheckTime >= BACKEND_CHECK_INTERVAL) {
    return false
  }
  return true
}

export function extractRequestPath(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try {
    return new URL(raw, window.location.origin).pathname
  } catch {
    return raw
  }
}

export function shouldTreatAsBackendOutage(input: RequestInfo | URL, status: number): boolean {
  if (!shouldMarkBackendUnavailable(status)) {
    return false
  }
  const path = extractRequestPath(input)
  return !BACKEND_OUTAGE_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))
}
