/**
 * Backend availability tracking and OAuth configuration probing.
 * Split from api.ts (tracked by #21384 / #21375).
 */
import { BACKEND_HEALTH_CHECK_TIMEOUT_MS } from '../constants'
import {
  reportBackendAvailable,
  reportBackendUnavailable,
  shouldMarkBackendUnavailable,
} from '../backendHealthEvents'
import { reportAppError } from '../errors/handleError'
import { safeParseJsonOrNull } from './helpers'
import type { OAuthProbeResult } from './types'
import { BACKEND_OUTAGE_EXEMPT_PREFIXES } from './endpoints'

const API_BASE = ''
const BACKEND_CHECK_INTERVAL = 10_000 // 10 seconds between backend checks when unavailable
/** How long to trust a cached backend-availability check (5 minutes) */
const BACKEND_CACHE_TTL_MS = 300_000
/** #6055 — number of retry attempts for checkOAuthConfiguredWithRetry during backend startup. */
const OAUTH_STARTUP_RETRY_ATTEMPTS = 5
/** #6055 — delay (ms) between retry attempts. */
const OAUTH_STARTUP_RETRY_DELAY_MS = 2_000

// Backend availability tracking with localStorage persistence
const BACKEND_STATUS_KEY = 'kc-backend-status'
export let backendLastCheckTime = 0
export let backendAvailable: boolean | null = null // null = unknown, true = available, false = unavailable
export let backendCheckPromise: Promise<boolean> | null = null

// Initialize from localStorage
try {
  const stored = localStorage.getItem(BACKEND_STATUS_KEY)
  if (stored) {
    const { available, timestamp } = JSON.parse(stored)
    // Use cached status if checked within the last 5 minutes
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

/**
 * Check backend availability - only makes ONE request, all others wait
 * Caches result in localStorage to avoid repeated checks across page loads
 * @param forceCheck - If true, ignores cache and always checks (used by login)
 */
export async function checkBackendAvailability(forceCheck = false): Promise<boolean> {
  // If we already know the status and it was checked recently, return it.
  // The TTL gate must always run so a previously-available backend is
  // re-probed periodically instead of being cached forever.
  if (!forceCheck && backendAvailable !== null) {
    const now = Date.now()
    if (now - backendLastCheckTime < BACKEND_CHECK_INTERVAL) {
      return backendAvailable
    }
  }

  // If a check is already in progress, wait for it
  if (backendCheckPromise) {
    return backendCheckPromise
  }

  // Start a new check
  backendCheckPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
      })
      // Backend is available if it responds at all (even non-200)
      // Only 5xx or network errors indicate backend is down
      backendAvailable = response.status < 500
      backendLastCheckTime = Date.now()
      // Cache to localStorage
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
      // Only cache failures in memory — do NOT persist false to localStorage.
      // Persisting false causes the stuck state where a fresh page load inherits
      // a stale "backend down" flag and blocks all API calls indefinitely.
      return false
    } finally {
      backendCheckPromise = null
    }
  })()

  return backendCheckPromise
}

/**
 * Check if the backend has OAuth configured by reading the /health endpoint.
 * Returns { backendUp, oauthConfigured, inCluster }.
 */
export async function checkOAuthConfigured(): Promise<OAuthProbeResult> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { backendUp: false, oauthConfigured: false, inCluster: false }
    // Parse JSON through the shared helper to avoid unhandled-rejection races in
    // Firefox and keep fallback behavior consistent.
    const data = await safeParseJsonOrNull<{ oauth_configured?: boolean; in_cluster?: boolean }>(
      response,
      '[api] /health OAuth config parse failed',
    )
    if (!data) return { backendUp: true, oauthConfigured: false, inCluster: false }
    return {
      // Any successful /health response means the backend is reachable.
      // A "degraded" status (e.g. all clusters unreachable) should NOT
      // flip the app into demo mode — only a network failure should (#5401).
      backendUp: true,
      oauthConfigured: !!data.oauth_configured,
      inCluster: !!data.in_cluster,
    }
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] OAuth configured check failed',
      level: 'warn',
      fallbackMessage: 'oauth configured check failed',
    })
    return { backendUp: false, oauthConfigured: false, inCluster: false }
  }
}

/**
 * #6055 — Retry wrapper around checkOAuthConfigured() for bootstrap races
 * where the frontend loads before the backend is accepting connections.
 * Retries up to OAUTH_STARTUP_RETRY_ATTEMPTS times, sleeping
 * OAUTH_STARTUP_RETRY_DELAY_MS between attempts, exiting early as soon as
 * the backend comes up.
 */
export async function checkOAuthConfiguredWithRetry(): Promise<OAuthProbeResult> {
  let lastResult: OAuthProbeResult = { backendUp: false, oauthConfigured: false, inCluster: false }
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
  // Don't persist false to localStorage — only keep in memory.
  // Persisting false causes fresh page loads to inherit stale "backend down" state.
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

/**
 * Check if the backend is known to be unavailable.
 * Returns true if backend is definitely unavailable (checked recently and failed).
 * Returns false if backend is available or status is unknown.
 */
export function isBackendUnavailable(): boolean {
  if (backendAvailable === null) return false // Unknown - allow first request
  if (backendAvailable) return false // Available

  // Check if enough time has passed for a recheck
  const now = Date.now()
  if (now - backendLastCheckTime >= BACKEND_CHECK_INTERVAL) {
    return false // Allow a recheck
  }

  return true // Known unavailable
}

export function extractRequestPath(input: RequestInfo | URL): string {
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

/** Reset backend-availability module state for tests. */
export function resetBackendStateForTests(): void {
  backendLastCheckTime = 0
  backendAvailable = null
  backendCheckPromise = null
}
