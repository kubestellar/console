export function isTransientLiveRead(entry: { method: string; status?: number; url: string }, origin: string): boolean {
  const TRANSIENT_STATUSES = [429, 503]
  try {
    const url = new URL(entry.url)
    return entry.method === 'GET' && TRANSIENT_STATUSES.includes(entry.status || 0)
      && url.origin === origin && url.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

// Self-contained so Playwright can serialize this function into the browser.
// Only safe reads are retried; mutations and non-transient failures are never replayed.
export async function readLiveApiWithBackoff(input: string | { endpoint: string; budgetMs: number }) {
  const MAX_ATTEMPTS = 3
  const REQUEST_TIMEOUT_MS = 5_000
  const INITIAL_BACKOFF_MS = 1_000
  const MAX_RETRY_DELAY_MS = 5_000
  const JITTER_MS = 250
  const DEFAULT_BUDGET_MS = 20_000
  const endpoint = typeof input === 'string' ? input : input.endpoint
  const deadline = Date.now() + (typeof input === 'string' ? DEFAULT_BUDGET_MS : input.budgetMs)
  const HTTP_TOO_MANY_REQUESTS = 429
  const HTTP_SERVICE_UNAVAILABLE = 503
  const attempts: Array<{ status: number; retryAfter: string | null }> = []

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(endpoint, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()))),
    })
    const text = await response.text()
    const retryAfter = response.headers.get('retry-after')
    attempts.push({ status: response.status, retryAfter })
    const result = { status: response.status, text, attempts }
    if (![HTTP_TOO_MANY_REQUESTS, HTTP_SERVICE_UNAVAILABLE].includes(response.status)
      || attempt === MAX_ATTEMPTS - 1) return result

    let delayMs = INITIAL_BACKOFF_MS * (2 ** attempt)
    if (retryAfter !== null) {
      const SECONDS_TO_MS = 1_000
      const seconds = Number(retryAfter)
      const headerDelay = Number.isFinite(seconds)
        ? seconds * SECONDS_TO_MS
        : Date.parse(retryAfter) - Date.now()
      if (Number.isFinite(headerDelay)) delayMs = Math.max(delayMs, headerDelay)
    }
    // Never retry earlier than the server requests. Long cooldowns remain failures
    // instead of consuming the entire promotion timeout or adding another burst.
    delayMs += Math.floor(Math.random() * JITTER_MS)
    if (delayMs > MAX_RETRY_DELAY_MS || Date.now() + delayMs >= deadline) return result
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  throw new Error('Live API retry budget exhausted')
}
