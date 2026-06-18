import { MCP_HOOK_TIMEOUT_MS } from './constants'
import { reportAppError } from './errors/handleError'

export const API_BASE = ''
export const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS

export const BACKEND_OUTAGE_EXEMPT_PREFIXES = ['/api/kagent/', '/api/kagenti-provider/']
export const TOKEN_REFRESH_HEADER = 'X-Token-Refresh'
export const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']

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
