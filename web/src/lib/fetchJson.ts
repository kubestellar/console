/**
 * fetchJson — Shared fetch utility for card data hooks.
 *
 * Provides a consistent pattern for fetching JSON from API endpoints with:
 *   - authFetch integration (JWT headers)
 *   - Abort signal with configurable timeout
 *   - NOT_INSTALLED_STATUSES handling (404/501/503 treated as empty, not failure)
 *   - Defensive JSON parsing (handles Netlify SPA fallback returning text/html)
 *
 * Previously duplicated across 7+ useCached* hooks. Now a single import.
 */

import { authFetch } from './api'
import { FETCH_DEFAULT_TIMEOUT_MS } from './constants/network'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchJsonResult<T> {
  data: T | null
  failed: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HTTP statuses that indicate "endpoint not available" — treat as empty, not
 * as a hard failure. 401/403 cover unauthenticated/demo visitors hitting
 * the JWT-protected /api group; 404/501/503 cover Netlify SPA fallback and
 * the MSW catch-all (#9933).
 */
export const NOT_INSTALLED_STATUSES = new Set<number>([401, 403, 404, 501, 503])

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch JSON from a URL with standard error handling for card hooks.
 *
 * @param url - The endpoint URL to fetch
 * @param timeoutMs - Abort timeout in milliseconds (default: FETCH_DEFAULT_TIMEOUT_MS)
 * @returns Object with `data` (parsed JSON or null) and `failed` (whether to throw)
 *
 * @example
 * ```ts
 * const result = await fetchJson<DaprStatusResponse>('/api/dapr/status')
 * if (result.failed) throw new Error('Unable to fetch Dapr status')
 * const body = result.data
 * ```
 */
export async function fetchJson<T>(
  url: string,
  timeoutMs: number = FETCH_DEFAULT_TIMEOUT_MS,
): Promise<FetchJsonResult<T>> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!resp.ok) {
      if (NOT_INSTALLED_STATUSES.has(resp.status)) {
        return { data: null, failed: false }
      }
      return { data: null, failed: true }
    }

    // Defensive JSON parse — Netlify SPA fallback may return text/html (#9933)
    let body: T
    try {
      body = (await resp.json()) as T
    } catch {
      return { data: null, failed: false }
    }
    return { data: body, failed: false }
  } catch {
    return { data: null, failed: true }
  }
}
