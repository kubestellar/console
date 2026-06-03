/**
 * Build WebSocket authentication using subprotocol-based token passing.
 *
 * #16508: Tokens in URL query parameters get logged by proxies, CDNs,
 * and browser history. Instead, we pass the token as a Sec-WebSocket-Protocol
 * subprotocol ("bearer.<token>") which is not logged in request URLs.
 *
 * The server validates the token from the subprotocol header and echoes it
 * back during the upgrade handshake.
 *
 * Falls back to query parameter for backwards compatibility with older agents.
 */
import { emitWsAuthMissing } from '../analytics'
import { isLocalAgentSuppressed } from '../constants/network'
import { isDemoMode } from '../demoMode'
import { getAgentToken, getStoredAgentToken } from '../../hooks/mcp/agentFetch'

/** Subprotocol prefix for bearer token authentication */
const WS_AUTH_PROTOCOL_PREFIX = 'bearer.'

/** Throttle: only emit once per session to avoid spamming GA4 */
let wsAuthMissingEmitted = false

/**
 * Fetch the kc-agent token if needed, then return the WebSocket URL
 * and protocols array for authentication.
 *
 * Returns { url, protocols } where protocols contains the auth subprotocol.
 * Callers should use: `new WebSocket(result.url, result.protocols)`
 */
export async function getWsAuthParams(url: string): Promise<{ url: string; protocols: string[] }> {
  await getAgentToken()

  const token = getStoredAgentToken()
  if (!token) {
    if (!wsAuthMissingEmitted && !isLocalAgentSuppressed() && !isDemoMode()) {
      wsAuthMissingEmitted = true
      emitWsAuthMissing(url)
    }
    return { url, protocols: [] }
  }

  // Use subprotocol-based auth (preferred — #16508)
  return { url, protocols: [`${WS_AUTH_PROTOCOL_PREFIX}${token}`] }
}
