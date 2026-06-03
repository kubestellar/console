// WebSocket connection management for cluster updates

import { isDemoToken } from '../../lib/demoMode'
import { isBackendUnavailable } from '../../lib/api'
import { getWsAuthParams } from '../../lib/utils/wsAuth'
import { isLikelyWsError, isWebDriverAutomation, resolveAgentWsUrl } from './wsDetect'
import { getStoredAgentToken } from './agentFetch'
import { MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY_MS, WS_BACKEND_RECHECK_INTERVAL } from './sharedImpl.constants'
import { clusterCache } from './sharedImpl.state'

// Forward declare fullFetchClusters to avoid circular import
// Will be set by the barrel file
let fullFetchClustersImpl: (() => Promise<void>) | null = null

export function setFullFetchClustersImpl(impl: () => Promise<void>) {
  fullFetchClustersImpl = impl
}

// Shared WebSocket connection state - prevents multiple connections
export const sharedWebSocket: {
  ws: WebSocket | null
  connecting: boolean
  reconnectTimeout: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
  authFailed: boolean
} = {
  ws: null,
  connecting: false,
  reconnectTimeout: null,
  reconnectAttempts: 0,
  authFailed: false,
}

// Track if backend WebSocket is known unavailable
let wsBackendUnavailable = false
let wsLastBackendCheck = 0

// Connect to shared WebSocket for kubeconfig change notifications
export async function connectSharedWebSocket() {
  // Don't attempt WebSocket if not authenticated or using demo token
  if (isDemoToken()) {
    return
  }

  // Playwright nightly runs the built bundle against `vite preview` (port 4173)
  // with no backend — so /ws has no listener. Firefox's retry behavior on the
  // failed connection cascades into NS_BINDING_ABORTED on subsequent page.goto
  // calls. All Playwright/Selenium-class drivers set navigator.webdriver=true.
  if (isWebDriverAutomation()) {
    return
  }

  // Set connecting flag FIRST to prevent race conditions (JS is single-threaded but
  // multiple React hook instances can call this in quick succession during initial render)
  if (sharedWebSocket.connecting || sharedWebSocket.ws?.readyState === WebSocket.OPEN) {
    return
  }

  // Don't retry if auth has already failed — wait for token refresh/re-login
  if (sharedWebSocket.authFailed) {
    return
  }

  const now = Date.now()

  // Skip if backend is known unavailable from HTTP checks (prevents initial WebSocket error)
  if (isBackendUnavailable()) {
    wsBackendUnavailable = true
    return
  }

  // Skip if backend WebSocket is known unavailable (with periodic re-check)
  if (wsBackendUnavailable && now - wsLastBackendCheck < WS_BACKEND_RECHECK_INTERVAL) {
    return
  }

  // Immediately mark as connecting to prevent other calls from starting
  sharedWebSocket.connecting = true

  // Don't reconnect if we've exceeded max attempts
  if (sharedWebSocket.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Mark backend as unavailable and stop trying
    wsBackendUnavailable = true
    wsLastBackendCheck = now
    sharedWebSocket.connecting = false
    return
  }

  try {
    const { url: authUrl, protocols } = await getWsAuthParams(resolveAgentWsUrl())
    const ws = new WebSocket(authUrl, protocols)

    ws.onopen = () => {
      // Guard against race condition where onclose fires before onopen
      // (observed in Safari and during rapid reconnection cycles).
      // ws.readyState may no longer be OPEN by the time this handler runs.
      if (ws.readyState !== WebSocket.OPEN) {
        return
      }
      // Send authentication message - backend requires this within 5 seconds
      const token = getStoredAgentToken()
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }))
      } else {
        sharedWebSocket.authFailed = true
        ws.close()
        return
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'authenticated') {
          sharedWebSocket.ws = ws
          sharedWebSocket.connecting = false
          sharedWebSocket.reconnectAttempts = 0 // Reset on successful connection
          sharedWebSocket.authFailed = false // Clear any previous auth failure
          wsBackendUnavailable = false // Backend is available
        } else if (msg.type === 'error') {
          sharedWebSocket.authFailed = true
          ws.close()
        } else if (msg.type === 'kubeconfig_changed' || msg.type === 'clusters_updated') {
          // Reset failure tracking on fresh kubeconfig
          clusterCache.consecutiveFailures = 0
          clusterCache.isFailed = false
          // If clusters_updated includes cluster data, we could use it directly
          // For now, just trigger a full refresh to get health data too
          if (fullFetchClustersImpl) {
            fullFetchClustersImpl()
          }
        }
      } catch {
        // Silently ignore parse errors
      }
    }

    ws.onerror = (error) => {
      // Silently handle connection errors - backend unavailability is expected in demo mode
      isLikelyWsError(error)
      sharedWebSocket.connecting = false
    }

    ws.onclose = () => {
      sharedWebSocket.ws = null
      sharedWebSocket.connecting = false

      // Auth failures are terminal — don't retry with the same invalid token
      if (sharedWebSocket.authFailed) {
        return
      }

      // Exponential backoff for reconnection (silent)
      if (sharedWebSocket.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, sharedWebSocket.reconnectAttempts)

        // Clear any existing reconnect timeout
        if (sharedWebSocket.reconnectTimeout) {
          clearTimeout(sharedWebSocket.reconnectTimeout)
        }

        sharedWebSocket.reconnectTimeout = setTimeout(() => {
          sharedWebSocket.reconnectAttempts++
          connectSharedWebSocket()
        }, delay)
      }
    }
  } catch {
    // Silently handle connection creation errors
    sharedWebSocket.connecting = false
  }
}

// Reset auth failure state — call when a fresh token becomes available.
// This clears the deadlock where authFailed blocks reconnection even after
// a valid token has been stored.
export function resetAuthFailed() {
  if (!sharedWebSocket.authFailed) return
  sharedWebSocket.authFailed = false
  sharedWebSocket.reconnectAttempts = 0
  // Trigger reconnection now that a valid token may be available
  connectSharedWebSocket()
}

// Cleanup WebSocket connection
export function cleanupSharedWebSocket() {
  if (sharedWebSocket.reconnectTimeout) {
    clearTimeout(sharedWebSocket.reconnectTimeout)
    sharedWebSocket.reconnectTimeout = null
  }
  if (sharedWebSocket.ws) {
    sharedWebSocket.ws.close()
    sharedWebSocket.ws = null
  }
  sharedWebSocket.connecting = false
  sharedWebSocket.reconnectAttempts = 0
}
