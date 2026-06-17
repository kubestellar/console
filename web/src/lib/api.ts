import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, MCP_HOOK_TIMEOUT_MS } from './constants'
import { emitHttpError } from './analytics'
import {
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
  markBackendFailure,
  markBackendSuccess,
  shouldTreatAsBackendOutage,
} from './apiBackendCheck'
import {
  BackendUnavailableError,
  RateLimitError,
  UnauthenticatedError,
  UnauthorizedError,
} from './apiErrors'
import {
  checkTokenRefresh,
  getApiHeaders,
  handleUnauthorizedResponse,
  hasAuthSession,
  isPublicApiPath,
} from './apiAuth'
import { reportAppError } from './errors/handleError'
import { getStoredAuthToken } from './authToken'

const API_BASE = ''
const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS
const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'
const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60

export {
  BackendUnavailableError,
  RateLimitError,
  UnauthenticatedError,
  UnauthorizedError,
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
}

function handle429(response: Response): never {
  const retryAfterRaw = response.headers.get('Retry-After')
  const retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  const effectiveRetry = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter
    : DEFAULT_RATE_LIMIT_RETRY_AFTER_S

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

function createErrorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown }
  error.cause = cause
  return error
}

async function safeReadTextOrEmpty(response: Response, context: string): Promise<string> {
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

async function safeParseJsonOrNull<T = unknown>(response: Response, context: string): Promise<T | null> {
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

class ApiClient {
  private createAbortController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    return { controller, timeoutId }
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      body?: unknown
      headers?: Record<string, string>
      timeout?: number
      requiresAuth?: boolean
      signal?: AbortSignal
    },
  ): Promise<{ data: T } | void> {
    if (method === 'GET' && options?.requiresAuth !== false && !isPublicApiPath(path) && !await hasAuthSession()) {
      throw new UnauthenticatedError()
    }

    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const headers = { ...await getApiHeaders(), ...options?.headers }
    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)
    const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/api/github/')) {
          handleUnauthorizedResponse()
          throw new UnauthorizedError()
        }
        if (response.status === 401) {
          throw new UnauthorizedError()
        }
        if (response.status === 429) {
          handle429(response)
        }
        const errorText = await safeReadTextOrEmpty(response, `[api] ${method} ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }

      markBackendSuccess()
      checkTokenRefresh(response)

      if (method === 'DELETE') {
        return
      }

      const data = await safeParseJsonOrNull<T>(response, `[api] ${method} ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        emitHttpError('timeout', `Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s`)
        throw createErrorWithCause(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`, error)
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        markBackendFailure()
        emitHttpError('network', error.message)
      }
      throw error
    }
  }

  async get<T = unknown>(path: string, options?: { headers?: Record<string, string>; timeout?: number; requiresAuth?: boolean; signal?: AbortSignal }): Promise<{ data: T }> {
    return this.request<T>('GET', path, options) as Promise<{ data: T }>
  }

  async post<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
    return this.request<T>('POST', path, { ...options, body }) as Promise<{ data: T }>
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
    return this.request<T>('PATCH', path, { ...options, body }) as Promise<{ data: T }>
  }

  async put<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
    return this.request<T>('PUT', path, { ...options, body }) as Promise<{ data: T }>
  }

  async delete(path: string, options?: { timeout?: number; headers?: Record<string, string> }): Promise<void> {
    await this.request('DELETE', path, options)
  }
}

export const api = new ApiClient()

export async function safeJson<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Expected JSON response but received ${contentType || 'unknown content-type'} (status ${response.status})`,
    )
  }
  return response.json() as Promise<T>
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getStoredAuthToken()
  const headers = new Headers(init?.headers)

  if (token && token !== DEMO_TOKEN_VALUE && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token)
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  const signal = init?.signal ?? AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(input, { ...init, headers, signal })
    if (shouldTreatAsBackendOutage(input, response.status)) {
      markBackendFailure(response.status)
    } else {
      markBackendSuccess(response.status)
    }
    const path = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.pathname
        : new URL(input.url, window.location.origin).pathname
    if (response.status === 401 && !path.startsWith('/api/github/')) {
      handleUnauthorizedResponse()
    }
    return response
  } catch (error) {
    markBackendFailure()
    throw error
  }
}
