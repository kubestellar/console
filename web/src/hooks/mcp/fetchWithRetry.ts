import { MCP_HOOK_TIMEOUT_MS } from '../../lib/constants'
import { agentFetch } from './agentFetch'

/** Options for fetchWithRetry */
export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 2, so 3 total attempts) */
  maxRetries?: number
  /** Initial backoff delay in ms (default: 500). Doubles on each retry. */
  initialBackoffMs?: number
  /** Timeout per attempt in ms (default: MCP_HOOK_TIMEOUT_MS) */
  timeoutMs?: number
}

/**
 * Returns true for errors that are worth retrying: network failures and timeouts.
 */
function isTransientError(error: unknown): boolean {
  // Network error (fetch throws TypeError on network failure)
  if (error instanceof TypeError) return true
  // AbortError from timeout — worth retrying
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return false
}

/**
 * Fetch with automatic retry on transient failures.
 *
 * Retries when:
 * - The fetch itself throws (network error, DNS failure, timeout)
 * - The server returns a 5xx status code
 *
 * Does NOT retry on:
 * - 4xx errors (client errors — retrying won't help)
 * - Successful responses (2xx/3xx)
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = 2,
    initialBackoffMs = 500,
    timeoutMs = MCP_HOOK_TIMEOUT_MS,
    ...fetchOptions
  } = options

  let lastError: unknown
  const totalAttempts = maxRetries + 1

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // Named handler so we can remove it after fetch completes (#4772)
    const onCallerAbort = () => controller.abort()
    if (fetchOptions.signal) {
      fetchOptions.signal.addEventListener('abort', onCallerAbort)
    }

    try {
      const response = await agentFetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      // Don't retry on 4xx — those are permanent client errors
      if (response.status >= 400 && response.status < 500) {
        return response
      }

      // Retry on 5xx server errors (unless this is the last attempt)
      if (response.status >= 500 && attempt < totalAttempts - 1) {
        lastError = new Error(`Server error: ${response.status}`)
        const backoff = initialBackoffMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, backoff))
        continue
      }

      return response
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      lastError = err
      // Only retry on transient errors
      if (!isTransientError(err) || attempt >= totalAttempts - 1) {
        throw err
      }
      const backoff = initialBackoffMs * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, backoff))
    } finally {
      // Remove abort listener to prevent accumulation (#4772)
      if (fetchOptions.signal) {
        fetchOptions.signal.removeEventListener('abort', onCallerAbort)
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError
}
