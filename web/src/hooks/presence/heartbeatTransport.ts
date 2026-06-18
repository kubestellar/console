/**
 * Netlify heartbeat transport — sends periodic POST requests to register browser presence
 * on serverless deployments that lack a persistent WebSocket backend.
 *
 * Uses jitter to spread requests across clients and avoids thundering-herd spikes.
 */

import { createAbortControllerWithTimeout, isAbortError } from './utils'
import { getSessionId } from './sessionId'
import { fetchActiveUsers } from './pollingTransport'

export const HEARTBEAT_INTERVAL = 30_000 // Heartbeat every 30 seconds
export const HEARTBEAT_JITTER = 3_000 // Jitter (0-3s) to spread heartbeats without long delays
const HEARTBEAT_REQUEST_TIMEOUT_MS = 5_000
export const HEARTBEAT_MIN_INTERVAL_MS = HEARTBEAT_INTERVAL

// Singleton heartbeat state (serverless mode)
let heartbeatStarted = false
let heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null
let heartbeatRequestController: AbortController | null = null
let lastHeartbeatAt = 0

// Send heartbeat POST to Netlify Function
async function sendHeartbeat(): Promise<void> {
  if (heartbeatRequestController) return

  const elapsedSinceLastHeartbeat = Date.now() - lastHeartbeatAt
  if (elapsedSinceLastHeartbeat < HEARTBEAT_MIN_INTERVAL_MS) return

  lastHeartbeatAt = Date.now()
  const { controller, timeoutId } = createAbortControllerWithTimeout(HEARTBEAT_REQUEST_TIMEOUT_MS)
  heartbeatRequestController = controller

  try {
    await fetch('/api/active-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ sessionId: getSessionId() }),
      signal: controller.signal
    })
  } catch (error) {
    if (!isAbortError(error)) {
      // Best-effort — don't block on failure
    }
  } finally {
    clearTimeout(timeoutId)
    if (heartbeatRequestController === controller) {
      heartbeatRequestController = null
    }
  }
}

// Start heartbeat for Netlify (replaces WebSocket presence)
export function startHeartbeat(): void {
  if (heartbeatStarted) return
  heartbeatStarted = true

  // Send initial heartbeat immediately, then poll for count
  sendHeartbeat().then(() => fetchActiveUsers()).catch(() => { /* best-effort */ })

  // Subsequent heartbeats with jitter to spread them out
  function scheduleNextHeartbeat() {
    // Use crypto.getRandomValues() — Math.random() is not cryptographically secure.
    // HEARTBEAT_JITTER fits well within a Uint32.
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const jitter = (arr[0] / 0x100000000) * HEARTBEAT_JITTER
    heartbeatTimeoutId = setTimeout(() => {
      sendHeartbeat()
      scheduleNextHeartbeat()
    }, HEARTBEAT_INTERVAL + jitter)
  }
  scheduleNextHeartbeat()
}

// Stop heartbeat timer chain
export function stopHeartbeat(): void {
  if (heartbeatTimeoutId) { clearTimeout(heartbeatTimeoutId); heartbeatTimeoutId = null }
  if (heartbeatRequestController) { heartbeatRequestController.abort(); heartbeatRequestController = null }
  heartbeatStarted = false
}

// ── State reset (tests only) ──

export function resetHeartbeatState(): void {
  if (heartbeatTimeoutId) { clearTimeout(heartbeatTimeoutId); heartbeatTimeoutId = null }
  if (heartbeatRequestController) { heartbeatRequestController.abort(); heartbeatRequestController = null }
  heartbeatStarted = false
  lastHeartbeatAt = 0
}
