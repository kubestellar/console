/**
 * WebSocket presence transport — manages the persistent WebSocket connection used to
 * track which users are currently connected (backend/OAuth mode only).
 *
 * Handles: connection setup, ping keep-alive, exponential-backoff reconnect, and
 * stale-connection detection via WsStaleDetection.
 */

import { createWsStaleDetection, type WsStaleDetectionController } from '../../lib/ws/useWsStaleDetection'
import { MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../../lib/constants/network'
import { getWsAuthParams } from '../../lib/utils/wsAuth'
import { getStoredAuthToken, getStoredAuthTokenSync } from '../../lib/authToken'
import { fetchActiveUsers, notifySubscribers } from './pollingTransport'

export const STALE_PRESENCE_TIMEOUT_MS = 45_000
/** Interval for WebSocket keep-alive pings (mirrors HEARTBEAT_INTERVAL) */
const PING_INTERVAL_MS = 30_000

// Singleton WebSocket presence state
let presenceWs: WebSocket | null = null
let presenceStarted = false
let presencePingInterval: ReturnType<typeof setInterval> | null = null
/** Pending reconnect timer — prevents duplicate connections (#7784) */
let presenceReconnectTimer: ReturnType<typeof setTimeout> | null = null
/** Current reconnect attempt counter */
let presenceReconnectAttempts = 0
let presenceIsStale = false
let presenceStaleDetection: WsStaleDetectionController | null = null

export function getPresenceIsStale(): boolean { return presenceIsStale }

function getPresenceStaleDetection(): WsStaleDetectionController {
  if (!presenceStaleDetection) {
    presenceStaleDetection = createWsStaleDetection({
      timeoutMs: STALE_PRESENCE_TIMEOUT_MS,
      isConnected: () => Boolean(presenceWs),
      shouldCheck: () => presenceStarted,
      onStale: () => {
        presenceIsStale = true
        notifySubscribers({ stale: true })
      },
    })
  }
  return presenceStaleDetection
}

export function stopPresenceConnection(): void {
  if (presenceReconnectTimer) { clearTimeout(presenceReconnectTimer); presenceReconnectTimer = null }
  if (presencePingInterval) { clearInterval(presencePingInterval); presencePingInterval = null }
  if (presenceWs) {
    presenceWs.onclose = null // Prevent reconnect from onclose handler
    presenceWs.close()
    presenceWs = null
  }
  presenceStarted = false
  presenceIsStale = false
  presenceStaleDetection?.stop()
  // Reset reconnect attempts when stopping
  presenceReconnectAttempts = 0
}

// Start WebSocket presence connection (backend mode)
export async function startPresenceConnection(): Promise<void> {
  if (presenceStarted) return

  const token = await getStoredAuthToken()
  if (!token) return

  // Set flag AFTER token check so a missing token doesn't permanently block
  presenceStarted = true

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || (protocol === 'wss:' ? '443' : '80')}/ws`

  async function connect() {
    try {
      const { url, protocols } = await getWsAuthParams(wsUrl)
      presenceWs = new WebSocket(url, protocols)
    } catch {
      presenceStarted = false
      return
    }

    presenceWs.onopen = () => {
      // Reset reconnect attempts on successful connection
      presenceReconnectAttempts = 0
      presenceIsStale = false
      getPresenceStaleDetection().markMessageReceived()
      getPresenceStaleDetection().start()
      notifySubscribers({ stale: false })
      // Read token fresh to avoid stale closure on reconnects
      const currentToken = getStoredAuthTokenSync()
      presenceWs?.send(JSON.stringify({ type: 'auth', token: currentToken }))
      // Clear any existing ping interval before starting a new one (prevents zombie intervals on reconnect)
      if (presencePingInterval) clearInterval(presencePingInterval)
      // Keep-alive ping every 30 seconds
      presencePingInterval = setInterval(() => {
        if (presenceWs?.readyState === WebSocket.OPEN) {
          presenceWs.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)
    }

    presenceWs.onmessage = (event) => {
      presenceIsStale = false
      getPresenceStaleDetection().markMessageReceived()

      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'authenticated') {
          // Connection registered with hub — refetch so our own connection is counted
          fetchActiveUsers()
        }
      } catch {
        // Ignore parse errors
      }
    }

    presenceWs.onclose = () => {
      if (presencePingInterval) clearInterval(presencePingInterval)
      // Clear any pending reconnect before scheduling a new one (#7784)
      if (presenceReconnectTimer) clearTimeout(presenceReconnectTimer)

      // Check if we've exceeded max reconnect attempts
      if (presenceReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
        console.error('[ActiveUsers] Max reconnect attempts exceeded, giving up')
        return
      }

      const delay = getWsBackoffDelay(presenceReconnectAttempts)
      console.debug(`[ActiveUsers] Connection lost, reconnecting in ${Math.round(delay)}ms (attempt ${presenceReconnectAttempts + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

      // Reconnect after exponential backoff delay
      presenceReconnectTimer = setTimeout(() => {
        presenceReconnectTimer = null
        presenceReconnectAttempts++
        if (presenceStarted && getStoredAuthTokenSync()) connect()
      }, delay)
    }

    presenceWs.onerror = () => {
      presenceWs?.close()
    }
  }

  connect()
}

// ── State reset (tests only) ──

export function resetWebSocketState(): void {
  if (presencePingInterval) { clearInterval(presencePingInterval); presencePingInterval = null }
  if (presenceReconnectTimer) { clearTimeout(presenceReconnectTimer); presenceReconnectTimer = null }
  if (presenceWs) { presenceWs.onclose = null; presenceWs.close(); presenceWs = null }
  presenceStarted = false
  presenceReconnectAttempts = 0
  presenceIsStale = false
  // Null out before stop so getPresenceStaleDetection() creates a fresh instance
  // on the next startPresenceConnection() call (null check at line 33 re-enters the factory).
  const detection = presenceStaleDetection
  presenceStaleDetection = null
  detection?.stop()
}
