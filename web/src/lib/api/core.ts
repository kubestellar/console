import {
  DEMO_TOKEN_VALUE,
  FETCH_DEFAULT_TIMEOUT_MS,
  MCP_HOOK_TIMEOUT_MS,
  STORAGE_KEY_HAS_SESSION,
} from '../constants'
import { emitHttpError } from '../analytics'
import { getStoredAuthToken } from '../authToken'
import { reportAppError } from '../errors/handleError'
import { handle401, handle429 } from './auth'
import {
  checkBackendAvailability,
  markBackendFailure,
  markBackendSuccess,
} from './backend'
import {
  BackendUnavailableError,
  UnauthenticatedError,
  UnauthorizedError,
} from './errors'
import {
  createErrorWithCause,
  extractRequestPath,
  safeParseJsonOrNull,
  safeReadTextOrEmpty,
  shouldTreatAsBackendOutage,
} from './helpers'

const API_BASE = ''
const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS
const TOKEN_REFRESH_HEADER = 'X-Token-Refresh'
const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']

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
      headers.Authorization = `Bearer ${token}`
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

  async get<T = unknown>(path: string, options?: { headers?: Record<string, string>; timeout?: number; requiresAuth?: boolean; signal?: AbortSignal }): Promise<{ data: T }> {
    const isPublicPath = PUBLIC_API_PREFIXES.some(prefix => path.startsWith(prefix))
    if (options?.requiresAuth !== false && !isPublicPath && !await this.hasToken()) {
      throw new UnauthenticatedError()
    }

    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const headers = { ...await this.getHeaders(), ...options?.headers }
    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)
    const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal

    try {
      const response = await fetch(`${API_BASE}${path}`, { method: 'GET', headers, signal })
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
        const errorText = await safeReadTextOrEmpty(response, `[api] GET ${path} failed to read error response body`)
        emitHttpError(String(response.status), errorText || '')
        throw new Error(errorText || `API error: ${response.status}`)
      }

      markBackendSuccess()
      this.checkTokenRefresh(response)
      const data = await safeParseJsonOrNull<T>(response, `[api] GET ${path} failed to parse JSON response`)
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

  async post<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
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

  async patch<T = unknown>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<{ data: T }> {
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

  async put<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<{ data: T }> {
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

  async delete(path: string, options?: { timeout?: number }): Promise<void> {
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
}

export const api = new ApiClient()

export async function safeJson<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON response but received ${contentType || 'unknown content-type'} (status ${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getStoredAuthToken()
  const headers = new Headers(init?.headers)

  if (token && token !== DEMO_TOKEN_VALUE && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
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
  } catch (error) {
    markBackendFailure()
    throw error
  }
}
