import { isDemoMode, isNetlifyDeployment } from '../../lib/demoMode'
import { emitAgentTokenFailure } from '../../lib/analytics'
import {
  LOCAL_AGENT_HTTP_URL,
  MCP_HOOK_TIMEOUT_MS,
} from '../../lib/constants'
import { isLocalAgentSuppressed } from '../../lib/constants/network'

// Re-export for backward compatibility
export const LOCAL_AGENT_URL = LOCAL_AGENT_HTTP_URL

export const AGENT_TOKEN_STORAGE_KEY = 'kc-agent-token'
const AGENT_TOKEN_FETCH_TIMEOUT_MS = 5000
/** How long to remember that the backend returned no token (avoids repeated 5s timeouts). */
const AGENT_TOKEN_NEGATIVE_CACHE_MS = 30_000

let agentTokenPromise: Promise<string> | null = null
/** Session-level dedup: only emit one agent_token_failure per page load */
let agentTokenFailureEmitted = false
/** Timestamp of last negative result (empty/error) — used for short-TTL in-memory cache. */
let agentTokenNegativeCacheUntil = 0

/** Reset internal getAgentToken state — exposed for tests only. */
export function _resetAgentTokenState(): void {
  agentTokenPromise = null
  agentTokenFailureEmitted = false
  agentTokenNegativeCacheUntil = 0
}

/**
 * Lazily fetch the kc-agent token from the backend. The token is cached
 * in localStorage so subsequent calls (and page reloads) don't re-fetch.
 *
 * On Netlify / demo mode there is no kc-agent backend, so we skip the
 * fetch entirely to avoid 404 → HTML parse errors that pollute GA4
 * (#10643, root cause of the 48-hour blank dashboard in #10398).
 *
 * Negative results (empty token or fetch error) are cached in memory for
 * AGENT_TOKEN_NEGATIVE_CACHE_MS to avoid repeated 5s timeouts (#11120).
 */
function getAgentToken(): Promise<string> {
  if (isDemoMode() || isNetlifyDeployment || isLocalAgentSuppressed()) return Promise.resolve('')

  const cached = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (cached) return Promise.resolve(cached)

  // Short-circuit if we recently got an empty/failed result
  if (Date.now() < agentTokenNegativeCacheUntil) return Promise.resolve('')

  if (!agentTokenPromise) {
    agentTokenPromise = fetch('/api/agent/token', {
      credentials: 'include',
      signal: AbortSignal.timeout(AGENT_TOKEN_FETCH_TIMEOUT_MS),
    })
      .then(r => r.ok ? r.json() : { token: '' })
      .then((data: { token?: string }) => {
        const token = data.token || ''
        if (token) {
          localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, token)
        } else {
          agentTokenNegativeCacheUntil = Date.now() + AGENT_TOKEN_NEGATIVE_CACHE_MS
          if (!agentTokenFailureEmitted) {
            agentTokenFailureEmitted = true
            emitAgentTokenFailure('empty token from /api/agent/token')
          }
        }
        agentTokenPromise = null
        return token
      })
      .catch((err) => {
        agentTokenNegativeCacheUntil = Date.now() + AGENT_TOKEN_NEGATIVE_CACHE_MS
        if (!agentTokenFailureEmitted) {
          agentTokenFailureEmitted = true
          emitAgentTokenFailure(err?.message || 'network error')
        }
        agentTokenPromise = null
        return ''
      })
  }
  return agentTokenPromise
}

/**
 * Drop-in replacement for `fetch()` that auto-injects the KC_AGENT_TOKEN
 * Authorization header when calling the kc-agent HTTP API. Without this,
 * requests to kc-agent are rejected when KC_AGENT_TOKEN is configured.
 */
export async function agentFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getAgentToken()
  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  // #10000 — CSRF defence-in-depth: state-changing requests must carry a
  // custom header that browsers never attach to cross-origin form POSTs.
  // The kc-agent requireCSRF middleware rejects POST/PUT/DELETE/PATCH
  // without this header.
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }
  // Use caller-provided signal, or fall back to a default timeout
  const signal = init?.signal ?? AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS)
  const response = await fetch(input, { ...init, headers, signal })

  // kc-agent generates a new token on each restart. If we get 401 and we
  // actually injected our token (caller had no pre-existing Authorization
  // header), clear the cached token and retry once with a fresh one.
  const weInjectedToken = token && !new Headers(init?.headers).has('Authorization')
  if (response.status === 401 && weInjectedToken) {
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    agentTokenPromise = null
    agentTokenNegativeCacheUntil = 0
    const freshToken = await getAgentToken()
    if (freshToken && freshToken !== token) {
      const retryHeaders = new Headers(init?.headers)
      retryHeaders.set('Authorization', `Bearer ${freshToken}`)
      if (!retryHeaders.has('X-Requested-With')) {
        retryHeaders.set('X-Requested-With', 'XMLHttpRequest')
      }
      return fetch(input, { ...init, headers: retryHeaders, signal })
    }
  }

  return response
}
