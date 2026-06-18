/**
 * api/utils.ts — API utility functions.
 * Extracted from api.ts per issue #19013.
 */
import { DEMO_TOKEN_VALUE, FETCH_DEFAULT_TIMEOUT_MS } from '../constants'
import { getStoredAuthToken } from '../authToken'
import { handle401 } from '../apiAuth'
import { markBackendFailure, markBackendSuccess } from '../apiBackendCheck'
import { extractRequestPath, shouldTreatAsBackendOutage } from '../apiHelpers'

/**
 * Safely parse a Response as JSON, guarding against HTML responses.
 */
export async function safeJson<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Expected JSON response but received ${contentType || 'unknown content-type'} (status ${response.status})`,
    )
  }
  return response.json() as Promise<T>
}

/**
 * Drop-in replacement for `fetch()` that auto-injects the JWT Authorization header.
 */
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
