/**
 * Shared utility functions for presence transports.
 */

/**
 * Guard against non-JSON responses (e.g. Netlify SPA catch-all returning index.html).
 * On Netlify without a Go backend, API calls can fall through to the `/* -> /index.html`
 * redirect if MSW hasn't registered yet or the Netlify Function fails. The response
 * has status 200 but content-type text/html, causing `response.json()` to throw
 * `SyntaxError: Unexpected token '<'`. Checking content-type prevents the parse attempt.
 */
export function isJsonResponse(resp: Response): boolean {
  const ct = resp.headers.get('content-type') || ''
  return ct.includes('application/json')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createAbortControllerWithTimeout(timeoutMs: number): {
  controller: AbortController
  timeoutId: ReturnType<typeof setTimeout>
} {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  return { controller, timeoutId }
}
