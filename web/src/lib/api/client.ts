import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_HAS_SESSION } from '../constants'
import { getStoredAuthToken } from '../authToken'
import { emitHttpError } from '../analytics'
import { reportAppError } from '../errors/handleError'
import {
  API_BASE,
  DEFAULT_RATE_LIMIT_RETRY_AFTER_S,
  DEFAULT_TIMEOUT,
  FETCH_DEFAULT_TIMEOUT_MS as DEFAULT_FETCH_TIMEOUT_MS,
  PUBLIC_API_PREFIXES,
  STORAGE_KEY_RATE_LIMIT_UNTIL,
  TOKEN_REFRESH_HEADER,
} from './config'
import {
  checkBackendAvailability,
  markBackendFailure,
  markBackendSuccess,
  shouldTreatAsBackendOutage,
} from './backend'
import {
  BackendUnavailableError,
  RateLimitError,
  UnauthenticatedError,
  UnauthorizedError,
} from './errors'
import { handle401 } from './auth'
import {
  createErrorWithCause,
  extractRequestPath,
  safeJson,
  safeParseJsonOrNull,
  safeReadTextOrEmpty,
} from './utils'

type ApiGetOptions = {
  headers?: Record<string, string>
  timeout?: number
  requiresAuth?: boolean
  signal?: AbortSignal
}

type ApiWriteOptions = {
  headers?: Record<string, string>
  timeout?: number
}

type RequestOptions = ApiGetOptions & {
  body?: unknown
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
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

class ApiClient {
  private refreshInProgress: Promise<void> | null = null

  private silentRefresh(): void {
    if (this.refreshInProgress) return

    this.refreshInProgress = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'same-origin',
          signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
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
      } catch (error: unknown) {
        reportAppError(error, {
          context: '[api] silent refresh failed',
          level: 'warn',
          fallbackMessage: 'token refresh failed',
        })
      } finally {
        this.refreshInProgress = null
      }
    })()
  }

  private checkTokenRefresh(response: Response): void {
    if (response.headers.get(TOKEN_REFRESH_HEADER) === 'true') {
      this.silentRefresh()
    }
  }

  private async getHeaders(): Promise<Record<string, string>> {
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

  private async hasToken(): Promise<boolean> {
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

  private createAbortController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    return { controller, timeoutId }
  }

  private async request<T = unknown>(path: string, options: RequestOptions): Promise<{ data: T } | void> {
    const isPublicPath = PUBLIC_API_PREFIXES.some(prefix => path.startsWith(prefix))
    if (options.method === 'GET' && options.requiresAuth !== false && !isPublicPath && !await this.hasToken()) {
      throw new UnauthenticatedError()
    }

    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT
    const { controller, timeoutId } = this.createAbortController(timeout)
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: options.method,
        headers: { ...await this.getHeaders(), ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal,
      })

      if (!response.ok) {
        await this.handleErrorResponse(path, options.method, response)
      }

      markBackendSuccess()
      this.checkTokenRefresh(response)

      if (options.method === 'DELETE') {
        return
      }

      const data = await safeParseJsonOrNull<T>(response, `[api] ${options.method} ${path} failed to parse JSON response`)
      return { data: data ?? ({} as T) }
    } catch (error: unknown) {
      this.handleRequestError(error, timeout, path)
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async handleErrorResponse(path: string, method: RequestOptions['method'], response: Response): Promise<never> {
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

    const errorText = await safeReadTextOrEmpty(response, `[api] ${method} ${path} failed to read error response body`)
    emitHttpError(String(response.status), errorText || '')
    throw new Error(errorText || `API error: ${response.status}`)
  }

  private handleRequestError(error: unknown, timeout: number, path: string): void {
    if (error instanceof Error && error.name === 'AbortError') {
      emitHttpError('timeout', `Request timeout after ${timeout / 1000}s`)
      throw createErrorWithCause(`Request timeout after ${timeout / 1000}s: ${path}`, error)
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      markBackendFailure()
      emitHttpError('network', error.message)
    }
  }

  async get<T = unknown>(path: string, options?: ApiGetOptions): Promise<{ data: T }> {
    return this.request<T>(path, {
      method: 'GET',
      headers: options?.headers,
      timeout: options?.timeout,
      requiresAuth: options?.requiresAuth,
      signal: options?.signal,
    }) as Promise<{ data: T }>
  }

  async post<T = unknown>(path: string, body?: unknown, options?: ApiWriteOptions): Promise<{ data: T }> {
    return this.request<T>(path, {
      method: 'POST',
      body,
      headers: options?.headers,
      timeout: options?.timeout,
    }) as Promise<{ data: T }>
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: ApiWriteOptions): Promise<{ data: T }> {
    return this.request<T>(path, {
      method: 'PATCH',
      body,
      headers: options?.headers,
      timeout: options?.timeout,
    }) as Promise<{ data: T }>
  }

  async put<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<{ data: T }> {
    return this.request<T>(path, {
      method: 'PUT',
      body,
      timeout: options?.timeout,
    }) as Promise<{ data: T }>
  }

  async delete(path: string, options?: { timeout?: number }): Promise<void> {
    await this.request(path, {
      method: 'DELETE',
      timeout: options?.timeout,
    })
  }
}

export const api = new ApiClient()

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
    const path = extractRequestPath(input)
    if (response.status === 401 && !path.startsWith('/api/github/')) {
      handle401()
    }
    return response
  } catch (error: unknown) {
    markBackendFailure()
    throw error
  }
}

export { safeJson }
