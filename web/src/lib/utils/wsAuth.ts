/**
 * Prepare kc-agent authentication for a WebSocket handshake.
 *
 * Browsers cannot set arbitrary headers on WebSocket requests, so the token is
 * encoded into a Sec-WebSocket-Protocol value instead of being exposed in the
 * URL.
 *
 * Fix for #13034: token fetch remains async so callers wait for the token
 * before opening the socket, preventing the original auth race.
 */
import { emitWsAuthMissing } from '../analytics'
import { isLocalAgentSuppressed } from '../constants/network'
import { isDemoMode } from '../demoMode'
import { getAgentToken, AGENT_TOKEN_STORAGE_KEY } from '../../hooks/mcp/agentFetch'

/** Base protocol echoed by kc-agent so browser handshakes succeed. */
const KC_AGENT_WS_PROTOCOL = 'kc-agent.v1'

/** Prefix for the encoded auth token carried in Sec-WebSocket-Protocol. */
const KC_AGENT_WS_TOKEN_PROTOCOL_PREFIX = 'kc-agent-token.'

/** Throttle: only emit once per session to avoid spamming GA4 */
let wsAuthMissingEmitted = false

function encodeWebSocketProtocolToken(token: string): string {
  const tokenBytes = new TextEncoder().encode(token)
  let binary = ''
  for (const byte of tokenBytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

/**
 * Fetch the kc-agent token if needed, then return the WebSocket subprotocols
 * required for authentication. Returns undefined when no token is available.
 */
export async function getAuthenticatedWebSocketProtocols(url: string): Promise<string[] | undefined> {
  await getAgentToken()

  const token = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (!token) {
    if (!wsAuthMissingEmitted && !isLocalAgentSuppressed() && !isDemoMode()) {
      wsAuthMissingEmitted = true
      emitWsAuthMissing(url)
    }
    return undefined
  }

  return [
    KC_AGENT_WS_PROTOCOL,
    `${KC_AGENT_WS_TOKEN_PROTOCOL_PREFIX}${encodeWebSocketProtocolToken(token)}`,
  ]
}

/**
 * Legacy helper retained for callers/tests that only need token prefetch and
 * analytics. The URL is returned unchanged because auth no longer travels in
 * the query string.
 */
export async function appendWsAuthToken(url: string): Promise<string> {
  await getAuthenticatedWebSocketProtocols(url)
  return url
}

/** Open an authenticated WebSocket without exposing the token in the URL. */
export async function openAuthenticatedWebSocket(url: string): Promise<WebSocket> {
  const protocols = await getAuthenticatedWebSocketProtocols(url)
  return protocols ? new WebSocket(url, protocols) : new WebSocket(url)
}
