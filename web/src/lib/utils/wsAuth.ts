/**
 * Append the kc-agent authentication token to a WebSocket URL.
 *
 * Browsers cannot set custom headers on WebSocket handshake requests,
 * so we pass the token as a query parameter instead.
 */
import { emitWsAuthMissing } from '../analytics'

/** localStorage key for the kc-agent shared secret */
const AGENT_TOKEN_STORAGE_KEY = 'kc-agent-token'

/** Query-string key used to pass the auth token on WebSocket URLs */
const WS_AUTH_QUERY_PARAM = 'token'

/** Throttle: only emit once per session to avoid spamming GA4 */
let wsAuthMissingEmitted = false

/**
 * If a kc-agent token exists in localStorage, append it to `url` as
 * `?token=<value>` (or `&token=<value>` when other params are present).
 * Returns the original URL unchanged when no token is stored.
 */
export function appendWsAuthToken(url: string): string {
  const token = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (!token) {
    if (!wsAuthMissingEmitted) {
      wsAuthMissingEmitted = true
      emitWsAuthMissing(url)
    }
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${WS_AUTH_QUERY_PARAM}=${encodeURIComponent(token)}`
}
