import { BACKEND_HEALTH_CHECK_TIMEOUT_MS } from './constants'
import {
  reportBackendAvailable,
  reportBackendUnavailable,
  shouldMarkBackendUnavailable,
} from './backendHealthEvents'
import { reportAppError } from './errors/handleError'

const API_BASE = ''
const BACKEND_CHECK_INTERVAL = 10_000
const BACKEND_CACHE_TTL_MS = 300_000
const BACKEND_STATUS_KEY = 'kc-backend-status'
const BACKEND_OUTAGE_EXEMPT_PREFIXES = ['/api/kagent/', '/api/kagenti-provider/']
const OAUTH_STARTUP_RETRY_ATTEMPTS = 5
const OAUTH_STARTUP_RETRY_DELAY_MS = 2_000

let backendLastCheckTime = 0
let backendAvailable: boolean | null = null
let backendCheckPromise: Promise<boolean> | null = null

try {
  const stored = localStorage.getItem(BACKEND_STATUS_KEY)
  if (stored) {
    const { available, timestamp } = JSON.parse(stored)
    if (Date.now() - timestamp < BACKEND_CACHE_TTL_MS) {
      backendAvailable = available
      backendLastCheckTime = timestamp
    }
  }
} catch (error: unknown) {
  reportAppError(error, {
    context: '[api] failed to load cached backend status',
    level: 'warn',
    fallbackMessage: 'backend status cache read failed',
  })
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
      } catch (error: unknown) {
        reportAppError(error, {
          context: '[api] failed to cache backend status',
          fallbackMessage: 'backend status cache write failed',
        })
      }
      return backendAvailable
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] backend availability check failed',
        level: 'warn',
        fallbackMessage: 'backend availability check failed',
      })
      backendAvailable = false
      backendLastCheckTime = Date.now()
      return false
    } finally {
      backendCheckPromise = null
    }
  })()

  return backendCheckPromise
}

async function safeParseJsonOrNull<T = unknown>(response: Response, context: string): Promise<T | null> {
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

export async function checkOAuthConfigured(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { backendUp: false, oauthConfigured: false }
    const data = await safeParseJsonOrNull<{ oauth_configured?: boolean }>(
      response,
      '[api] /health OAuth config parse failed',
    )
    if (!data) return { backendUp: false, oauthConfigured: false }
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

export async function checkOAuthConfiguredWithRetry(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  let lastResult = { backendUp: false, oauthConfigured: false }
  for (let attempt = 0; attempt < OAUTH_STARTUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await checkOAuthConfigured()
      lastResult = result
      if (result.backendUp) return result
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] OAuth startup check failed; retrying',
        level: 'warn',
        fallbackMessage: 'oauth startup check failed',
      })
    }
    if (attempt < OAUTH_STARTUP_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, OAUTH_STARTUP_RETRY_DELAY_MS))
    }
  }
  return lastResult
}

export function markBackendFailure(status?: number): void {
  backendAvailable = false
  backendLastCheckTime = Date.now()
  reportBackendUnavailable('http', status)
  try {
    localStorage.removeItem(BACKEND_STATUS_KEY)
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] failed to clear backend status cache',
      fallbackMessage: 'backend status cache clear failed',
    })
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
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] failed to cache backend success',
      fallbackMessage: 'backend success cache write failed',
    })
  }
}

export function isBackendUnavailable(): boolean {
  if (backendAvailable === null) return false
  if (backendAvailable) return false

  const now = Date.now()
  if (now - backendLastCheckTime >= BACKEND_CHECK_INTERVAL) {
    return false
  }

  return true
}

function extractRequestPath(input: RequestInfo | URL): string {
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url

  try {
    return new URL(raw, window.location.origin).pathname
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] failed to normalize request path',
      level: 'warn',
      fallbackMessage: 'request path normalization failed',
    })
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
