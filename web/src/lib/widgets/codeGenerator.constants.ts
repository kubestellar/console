/**
 * Constants for widget code generation
 */

// Übersicht widgets run outside the browser, so curl needs a full URL.
// When the API endpoint is empty (same-origin in-browser), fall back to the
// backend directly on port 8081. The watcher on 8080 has short proxy timeouts
// that cause "backend_unavailable" for slow fan-out endpoints.
export const UBERSICHT_FALLBACK_URL = 'http://localhost:8081'

// Cache file for the agent token — avoids a round-trip on every widget refresh.
// Token is re-fetched automatically on 401 (server restart, token rotation).
export const WIDGET_TOKEN_CACHE = '/tmp/.kc-widget-token'
