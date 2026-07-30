/**
 * ApiClient class (get/post/patch/put/delete), singleton `api`, and authFetch helper.
 * Split from api.ts (tracked by #21384 / #21375).
 */
import { MCP_HOOK_TIMEOUT_MS, FETCH_DEFAULT_TIMEOUT_MS, DEMO_TOKEN_VALUE, STORAGE_KEY_HAS_SESSION } from '../constants'
import { getStoredAuthToken } from '../authToken'
import { emitHttpError } from '../analytics'
import { reportAppError } from '../errors/handleError'
import { UnauthenticatedError, UnauthorizedError, BackendUnavailableError } from './types'
import { PUBLIC_API_PREFIXES } from './endpoints'
import { handle401, handle429 } from './session'
import {
  checkBackendAvailability,
  markBackendFailure,
  markBackendSuccess,
  shouldTreatAsBackendOutage,
  extractRequestPath,
} from './backend'
import {
  createErrorWithCause,
  isAbortError,
  safeReadTextOrEmpty,
  safeParseJsonOrNull,
} from './helpers'

const API_BASE = ''
const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS
const TOKEN_REFRESH_HEADER = 'X-Token-Refresh' // server signals when token should be refreshed

class ApiClient {
  private refreshInProgress: Promise<void> | null = null

  /**
   * Silently refresh the JWT token in the background.
   * Called when the server returns X-Token-Refresh header indicating the token
   * has passed 50% of its lifetime and should be renewed.
   */
  private silentRefresh(): void {
    if (this.refreshInProgress) return
    this.refreshInProgress = (async () => {
      try {
        // #8108 — /auth/refresh must NOT receive the Authorization header.
        // Backend RefreshToken revokes the JTI of whatever bearer is presented
        // before minting the replacement. Sending the stale localStorage token
        // would revoke a token we still rely on for the rest of the session
        // and race against the cookie delivery. Cookie-only flow: send the
        // HttpOnly kc_auth cookie via credentials + CSRF header only.
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // #6588 — CSRF gate on /auth/refresh
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'same-origin',
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (response.ok) {
          // #6590 — /auth/refresh delivers the new JWT exclusively via the
          // HttpOnly kc_auth cookie; the JSON body carries only
          // { refreshed: true, onboarded }. There is no token to copy into
          // localStorage. The browser sends the refreshed cookie automatically
          // on subsequent requests, and the JWTAuth middleware reads it.
          // Nothing else to do here on success.
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
      } catch (error: unknown) {
        reportAppError(error, {
          context: '[api] silent refresh failed',
          level: 'warn',
          fallbackMessage: 'token refresh failed',
        })
        // Silent refresh failure is non-fatal — the current token is still valid
      } finally {
        this.refreshInProgress = null
      }
    })()
  }

  /**
   * Check the response for the X-Token-Refresh header and trigger a
   * background refresh if present.
   */
  private checkTokenRefresh(response: Response): void {
    if (response.headers.get(TOKEN_REFRESH_HEADER) === 'true') {
      this.silentRefresh()
    }
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // #8830 — the /api group middleware rejects state-changing requests
      // (POST/PUT/DELETE/PATCH) without this header. Harmless on GET.
      'X-Requested-With': 'XMLHttpRequest',
    }
    const token = await getStoredAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private async hasToken(): Promise<boolean> {
    const token = await getStoredAuthToken()
    if (token && token !== DEMO_TOKEN_VALUE) return true
    // #6590 / #8087 — A cookie-only session has no JS-readable token, only
    // the HttpOnly kc_auth cookie. The kc-has-session marker is set after
    // /auth/refresh succeeds; treat its presence as a real session so API
    // calls go through (the cookie is sent automatically same-origin and
    // JWTAuth middleware accepts it).
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

  private createAbortController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    return { controller, timeoutId }
  }

  async get<T = unknown>(path: string, options?: { headers?: Record<string, string>; timeout?: number; requiresAuth?: boolean; signal?: AbortSignal }): Promise<{ data: T }> {
    // Skip API calls to protected endpoints when not authenticated
    const isPublicPath = PUBLIC_API_PREFIXES.some(prefix => path.startsWith(prefix))
    if (options?.requiresAuth !== false && !isPublicPath && !await this.hasToken()) {
      // Do NOT emit a GA4 error here — this is expected behavior when an
      // unauthenticated user visits a protected page. Emitting it caused
      // false-positive monitoring alerts (#9968, #9979, #9980, #9984).
      throw new UnauthenticatedError()
    }

    // Check backend availability - waits for single health check on first load
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const headers = { ...await this.getHeaders(), ...options?.headers }
    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)
    const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        headers,
        signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle 401 Unauthorized - token is invalid or expired.
        // EXCLUDE per-feature endpoints whose 401 means a third-party token
        // (e.g. GitHub OAuth) is missing/expired, NOT that the user's app
        // session is dead. Logging the user out of the whole console because
        // their GitHub token expired is a confusing dead end (e.g. clicking
        // the "kubara" repo in the Mission Browser triggered a full logout).
        // For these paths, surface the 401 to the caller so the feature can
        // show its own auth prompt.
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handle401()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] GET ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      this.checkTokenRefresh(response)
      const data = await safeParseJsonOrNull<T>(response, `[api] GET ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, err)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', err.message)
      }
      throw err
    }
  }

  async post<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { ...await this.getHeaders(), ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle 401 Unauthorized - token is invalid or expired.
        // EXCLUDE per-feature endpoints (see GET handler comment) so a
        // GitHub-OAuth-token expiry on /api/github/* doesn't log the user
        // out of the entire console.
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handle401()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] POST ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      this.checkTokenRefresh(response)
      const data = await safeParseJsonOrNull<T>(response, `[api] POST ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, err)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', err.message)
      }
      throw err
    }
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers: { ...await this.getHeaders(), ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handle401()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] PATCH ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      this.checkTokenRefresh(response)
      const data = await safeParseJsonOrNull<T>(response, `[api] PATCH ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, err)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', err.message)
      }
      throw err
    }
  }

  async put<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<{ data: T }> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: await this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle 401 Unauthorized - token is invalid or expired.
        // EXCLUDE per-feature endpoints (see GET handler comment) so a
        // GitHub-OAuth-token expiry on /api/github/* doesn't log the user
        // out of the entire console.
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handle401()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] PUT ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      this.checkTokenRefresh(response)
      const data = await safeParseJsonOrNull<T>(response, `[api] PUT ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, err)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', err.message)
      }
      throw err
    }
  }

  async delete(path: string, options?: { timeout?: number }): Promise<void> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: await this.getHeaders(),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle 401 Unauthorized - token is invalid or expired.
        // EXCLUDE per-feature endpoints (see GET handler comment) so a
        // GitHub-OAuth-token expiry on /api/github/* doesn't log the user
        // out of the entire console.
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handle401()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] DELETE ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      this.checkTokenRefresh(response)
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, err)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', err.message)
      }
      throw err
    }
  }
}

export const api = new ApiClient()

/**
 * Drop-in replacement for `fetch()` that auto-injects the JWT Authorization
 * header from localStorage.  Use this for MCP endpoint calls that need auth
 * but return a raw Response (unlike `api.get()` which returns `{data}`).
 *
 * Existing callers only need to change `fetch(url, init)` -> `authFetch(url, init)`.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getStoredAuthToken()
  const headers = new Headers(init?.headers)

  if (token && token !== DEMO_TOKEN_VALUE && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  // #8830 — /api group RequireCSRF middleware rejects state-changing requests
  // without this header; safeHTTPMethods pass through unconditionally, so
  // setting it on every authFetch is correct and harmless for GET/HEAD.
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  // Use caller-provided signal if present, otherwise apply default timeout
  const signal = init?.signal ?? AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(input, { ...init, headers, signal })
    if (shouldTreatAsBackendOutage(input, response.status)) {
      markBackendFailure(response.status)
    } else {
      markBackendSuccess(response.status)
    }
    const path = extractRequestPath(input)
    if (response.status === 401 && !path.startsWith('/api/github/')) {
      handle401()
    }
    return response
  } catch (error) {
    markBackendFailure()
    throw error
  }
}
