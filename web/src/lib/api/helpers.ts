/**
 * Low-level utilities for parsing HTTP responses and creating errors.
 * Split from api.ts (tracked by #21384 / #21375).
 */
import { reportAppError } from '../errors/handleError'

export function createErrorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown }
  error.cause = cause
  return error
}

/**
 * Detect AbortError across environments. jsdom's DOMException does not
 * extend Error, so a plain `err instanceof Error` check fails to recognize
 * an AbortError DOMException in tests. Check `.name` directly instead.
 */
export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError'
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

/**
 * Safely parse a Response as JSON, guarding against HTML responses.
 *
 * On Netlify, unmatched API routes fall through to the SPA catch-all which
 * returns index.html (200 OK, text/html). Calling `.json()` on that response
 * throws "Unexpected token '<'" (#9797). This helper checks the Content-Type
 * header first and throws a descriptive error instead of a cryptic parse error.
 *
 * Usage:
 *   const data = await safeJson<MyType>(response)
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
