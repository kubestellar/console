import type { APIRequestContext, APIResponse } from '@playwright/test'

/**
 * Fetch a URL via Playwright's request API with exponential backoff retry
 * for transient upstream errors (5xx). Addresses flaky 502 responses from
 * GitHub raw content CDN (#10966).
 */

/** Maximum number of retry attempts (total attempts = MAX_RETRIES + 1) */
const MAX_RETRIES = 3

/** Base delay between retries in milliseconds */
const RETRY_BASE_DELAY_MS = 1_000

/** Default request timeout per attempt in milliseconds */
const DEFAULT_PER_ATTEMPT_TIMEOUT_MS = 30_000

export interface FetchWithRetryOptions {
  /** Per-attempt timeout in milliseconds (default: 30 000) */
  timeout?: number
}

export async function fetchWithRetry(
  request: APIRequestContext,
  url: string,
  options?: FetchWithRetryOptions,
): Promise<APIResponse> {
  const perAttemptTimeout = options?.timeout ?? DEFAULT_PER_ATTEMPT_TIMEOUT_MS
  let lastResp: APIResponse | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * (1 << (attempt - 1))
      console.log(`[fetchWithRetry] Attempt ${attempt + 1}/${MAX_RETRIES + 1} after ${delay}ms delay for ${url}`)
      await new Promise((r) => setTimeout(r, delay))
    }

    lastResp = await request.get(url, { timeout: perAttemptTimeout })

    // Don't retry client errors (4xx) — only transient 5xx
    if (lastResp.ok() || lastResp.status() < 500) {
      return lastResp
    }

    console.warn(
      `[fetchWithRetry] HTTP ${lastResp.status()} on attempt ${attempt + 1}/${MAX_RETRIES + 1} for ${url}`,
    )
  }

  // Return the last response even if it's a 5xx — let the caller decide
  return lastResp!
}
