/**
 * Append the kc-agent authentication token to a WebSocket URL.
 *
 * Browsers cannot set custom headers on WebSocket handshake requests,
 * so we pass the token as a query parameter instead.
 *
 * Fix for #13034: This function is now async and awaits the token fetch
 * to prevent the race condition where WebSocket connections opened before
 * the token was available, causing correlated ws_auth_missing and
 * agent_token_failure spikes in GA4.
 */
import { emitWsAuthMissing } from '../analytics'
import { isLocalAgentSuppressed } from '../constants/network'
import { isDemoMode } from '../demoMode'
import { getAgentToken, AGENT_TOKEN_STORAGE_KEY } from '../../hooks/mcp/agentFetch'

/** Query-string key used to pass the auth token on WebSocket URLs */
const WS_AUTH_QUERY_PARAM = 'token'

/** Throttle: only emit once per session to avoid spamming GA4 */
let wsAuthMissingEmitted = false

/**
 * Fetch the kc-agent token if needed, then append it to `url` as
 * `?token=<value>` (or `&token=<value>` when other params are present).
 * Returns the original URL unchanged when no token is available.
 *
 * This function ensures the token fetch completes before opening a
 * WebSocket connection, preventing the race condition in #13034.
 */
export async function appendWsAuthToken(url: string): Promise<string> {
  // Ensure token fetch has completed (or immediately resolve if demo mode)
  await getAgentToken()
  
  const token = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (!token) {
    if (!wsAuthMissingEmitted && !isLocalAgentSuppressed() && !isDemoMode()) {
      wsAuthMissingEmitted = true
      emitWsAuthMissing(url)
    }
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${WS_AUTH_QUERY_PARAM}=${encodeURIComponent(token)}`
}
