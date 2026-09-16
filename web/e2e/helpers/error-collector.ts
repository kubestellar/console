import { type Page, type ConsoleMessage } from '@playwright/test'

// ---------------------------------------------------------------------------
// Expected console errors — shared across all test files
// ---------------------------------------------------------------------------

// Expected console error patterns. Each entry should be as NARROW as possible
// so we don't accidentally suppress a real production crash (see #9083).
// If you need to add a broad suppression, tie it to a tracking issue with a
// comment linking the issue number — so the suppression can be removed once
// the root cause is fixed.
export const EXPECTED_ERROR_PATTERNS = [
  /Failed to fetch/i, // Network errors in demo mode
  /WebSocket/i, // WebSocket not available in tests
  /can[\u2018\u2019']t establish a connection/i, // Firefox WebSocket connection errors (Firefox uses curly apostrophes)
  /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i, // Benign ResizeObserver loop warning
  /validateDOMNesting/i, // Already tracked by Auto-QA DOM errors check
  /act\(\)/i, // React testing warnings
  /ChunkLoadError/i, // Expected during code splitting
  /Loading chunk \d+ failed/i, // Code-split chunk load failure (retried automatically)
  /demo-token/i, // Demo mode messages
  /localhost:8585/i, // Agent connection attempts in demo mode
  /127\.0\.0\.1:8585/i, // Agent connection attempts (IP form)
  /Cross-Origin Request Blocked/i, // CORS errors when backend/agent not running
  /blocked by CORS policy/i, // Chromium CORS wording (Firefox uses pattern above)
  /Access to fetch.*has been blocked by CORS/i, // Chromium-specific phrasing; Medium blog public fallback is cross-origin from vite preview (localhost:4173 → console.kubestellar.io)
  /Origin .* is not allowed by Access-Control-Allow-Origin/i, // WebKit/Safari CORS wording (distinct from Chromium/Firefox patterns above)
  /Access-Control-Allow-Origin.*localhost/i, // WebKit CORS variant referencing localhost origin
  /Access-Control-Allow-Origin.*127\.0\.0\.1/i, // WebKit CORS variant referencing loopback IP
  /Notification permission/i, // Firefox blocks notification requests outside user gestures
  /MIME type.*text\/event-stream/i, // SSE endpoint returning wrong content-type in dev mode
  /Notification prompting can only be done from a user gesture/i, // WebKit/Safari wording for notification gesture block
  /ERR_CONNECTION_REFUSED/i, // Backend/agent not running in CI
  /net::ERR_CONNECTION_REFUSED.*(:8585|:8080|localhost)/i, // Agent/backend ports only in demo mode (#11294)
  /Could not connect to [0-9.]+/i, // WebKit wording for connection refused (no net:: prefix)
  /Connection refused.*(:8585|:8080|127\.0\.0\.1|localhost)/i, // Backend/agent connection only (#11294)
  /502.*Bad Gateway/i, // Reverse proxy errors when backend not running
  /Failed to load resource.*(:8585|:8080|:4173|\/api\/)/i, // Backend/preview API resource failures (#11294, #11660)
  /the server responded with a status of [45]\d{2}/i, // 4xx/5xx status errors in demo/CI mode (#11520, #11660)
  /^.*(?:^|[^a-z0-9.-])console\.kubestellar\.io(?=[:/ ]|$).*$/i, // External origin fetch failures for the hosted console only (#11520)
  // SQLite WASM cache worker — webkit/Safari can't streaming-compile the
  // sqlite3 wasm, and the worker has a documented IndexedDB fallback path
  // (see lib/cache/worker.ts). These errors emit from the sqlite-wasm loader
  // before our catch block runs, so they must be filtered here. Scoped to
  // the SQLite module specifically (#9083) so unrelated IndexedDB/WASM
  // failures are NOT suppressed.
  /wasm streaming compile failed.*sqlite/i,
  /failed to asynchronously prepare wasm.*sqlite/i,
  /Aborted\(NetworkError.*sqlite/i,
  /Exception loading sqlite3 module/i,
  /\[kc\.cache\] sqlite/i,
  // Firefox aborts in-flight requests when page.goto() is called again before
  // previous navigation settles. These NS_BINDING_ABORTED errors do not
  // indicate a real page failure — they're test harness cleanup noise.
  /NS_BINDING_ABORTED/i,
  /NS_ERROR_FAILURE/i,
  /Fetch failed: Invalid JSON response/i,
  /\[Cache\] Failed to/i, // Cache persistence errors in CI (no OPFS/IndexedDB support) (#11660)
  /\[IndexedData\] Failed to/i, // IndexedDB fallback errors in CI (#11660)
  /\[CacheWorkerRpc\] Worker error/i, // Cache worker failures in CI (#11660)
  /\[mockApiFallback\]/i, // Test mock logging that leaks to browser console (#11660)
  /Error fetching from cluster/i, // Cluster fetch errors when backend is unavailable (#11660)
  /\[SSE\] .*retr/i, // SSE retry-related messages (backoff, exhaustion) (#12742)
  /\[AppErrorBoundary\] Uncaught error:/i, // Specific global React error boundary log
]

export function isExpectedError(message: string): boolean {
  return EXPECTED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

// ---------------------------------------------------------------------------
// Error collector — tracks unexpected console errors during test
// ---------------------------------------------------------------------------

export function setupErrorCollector(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error' && !isExpectedError(text)) {
      errors.push(text)
    }
    if (msg.type() === 'warning' && !isExpectedError(text)) {
      warnings.push(text)
    }
  })

  return { errors, warnings }
}
