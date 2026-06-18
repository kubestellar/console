import { reportBackendAvailable, reportBackendUnavailable, shouldMarkBackendUnavailable } from '../backendHealthEvents'
import { reportAppError } from '../errors/handleError'
import {
  API_BASE,
  BACKEND_CACHE_TTL_MS,
  BACKEND_CHECK_INTERVAL_MS,
  BACKEND_HEALTH_TIMEOUT_MS,
  BACKEND_OUTAGE_EXEMPT_PREFIXES,
  BACKEND_STATUS_KEY,
} from './config'
import { extractRequestPath } from './utils'

let backendLastCheckTime = 0
let backendAvailable: boolean | null = null
let backendCheckPromise: Promise<boolean> | null = null

try {
  const stored = localStorage.getItem(BACKEND_STATUS_KEY)
  if (stored) {
    const { available, timestamp } = JSON.parse(stored) as { available: boolean; timestamp: number }
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
    if (now - backendLastCheckTime < BACKEND_CHECK_INTERVAL_MS) {
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
        signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS),
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
  if (backendAvailable === null || backendAvailable) {
    return false
  }

  const now = Date.now()
  if (now - backendLastCheckTime >= BACKEND_CHECK_INTERVAL_MS) {
    return false
  }

  return true
}

export function shouldTreatAsBackendOutage(input: RequestInfo | URL, status: number): boolean {
  if (!shouldMarkBackendUnavailable(status)) {
    return false
  }
  const path = extractRequestPath(input)
  return !BACKEND_OUTAGE_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))
}
