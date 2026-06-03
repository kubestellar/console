/**
 * Ensure the kc-agent authentication token is loaded before opening a WebSocket.
 *
 * Browsers cannot set custom headers on WebSocket handshake requests, so the
 * token is sent as the first WebSocket message after the connection opens.
 *
 * Fix for #13034: This function remains async and awaits the token fetch to
 * prevent the race condition where WebSocket connections opened before the
 * token was available, causing correlated ws_auth_missing and
 * agent_token_failure spikes in GA4.
 */
import { emitWsAuthMissing } from '../analytics'
import { isLocalAgentSuppressed } from '../constants/network'
import { isDemoMode } from '../demoMode'
import { getAgentToken, AGENT_TOKEN_STORAGE_KEY } from '../../hooks/mcp/agentFetch'

interface WsAuthMessage {
  type: 'auth'
  token: string
}

/** Throttle: only emit once per session to avoid spamming GA4 */
let wsAuthMissingEmitted = false

function emitMissingWsAuth(url: string): void {
  if (!wsAuthMissingEmitted && !isLocalAgentSuppressed() && !isDemoMode()) {
    wsAuthMissingEmitted = true
    emitWsAuthMissing(url)
  }
}

/**
 * Fetch the kc-agent token if needed before opening a WebSocket.
 * Returns the original URL unchanged so secrets never appear in the URL.
 */
export async function appendWsAuthToken(url: string): Promise<string> {
  await getAgentToken()

  if (!localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)) {
    emitMissingWsAuth(url)
  }

  return url
}

/**
 * Send the kc-agent auth token as the first WebSocket message.
 * Returns false when no token is available and closes the socket.
 */
export function sendWsAuthMessage(ws: WebSocket, url: string = ws.url): boolean {
  const token = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (!token) {
    emitMissingWsAuth(url)
    ws.close()
    return false
  }

  const authMessage: WsAuthMessage = { type: 'auth', token }
  ws.send(JSON.stringify(authMessage))
  return true
}
