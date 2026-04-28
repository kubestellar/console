import { useState, useEffect } from 'react'
import { getDemoMode, isDemoModeForced } from './useDemoMode'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

/**
 * Disconnect the presence WebSocket and stop the heartbeat.
 * MUST be called during logout to prevent stale auth tokens from being
 * transmitted on a persistent connection after the user signs out (#4936).
 */
export function disconnectPresence(): void {
  stopPresenceConnection()
  stopHeartbeat()
}

export interface ActiveUsersInfo {
  activeUsers: number
  totalConnections: number
}

const POLL_INTERVAL = 10_000 // Poll every 10 seconds
const HEARTBEAT_INTERVAL = 30_000 // Heartbeat every 30 seconds
const HEARTBEAT_JITTER = 3_000 // Jitter (0-3s) to spread heartbeats without long delays

import { MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../lib/constants/network'
import { appendWsAuthToken } from '../lib/utils/wsAuth'

const RECOVERY_DELAY = 30_000 // Retry after circuit breaker trips
/** Timeout for fetch() call to the active-users endpoint */
const ACTIVE_USERS_FETCH_TIMEOUT_MS = 5_000

/**
 * Guard against non-JSON responses (e.g. Netlify SPA catch-all returning index.html).
 * On Netlify without a Go backend, API calls can fall through to the `/* -> /index.html`
 * redirect if MSW hasn't registered yet or the Netlify Function fails. The response
 * has status 200 but content-type text/html, causing `response.json()` to throw
 * `SyntaxError: Unexpected token '<'`. Checking content-type prevents the parse attempt.
 */
function isJsonResponse(resp: Response): boolean {
  const ct = resp.headers.get('content-type') || ''
  return ct.includes('application/json')
}

// Singleton state to share across all hook instances
let sharedInfo: ActiveUsersInfo = {
  activeUsers: 0,
  totalConnections: 0
}
let pollStarted = false
let pollInterval: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0
let hasFetchedOnce = false
const MAX_FAILURES = 3
const subscribers = new Set<(info: ActiveUsersInfo) => void>()
const stateSubscribers = new Set<(state: { loading?: boolean; error?: boolean }) => void>()

// Singleton presence WebSocket connection (backend mode)
let presenceWs: WebSocket | null = null
let presenceStarted = false
let presencePingInterval: ReturnType<typeof setInterval> | null = null
/** Pending reconnect timer for the presence WebSocket — prevents duplicate connections (#7784) */
let presenceReconnectTimer: ReturnType<typeof setTimeout> | null = null
/** Track current reconnect attempt number for presence WebSocket */
let presenceReconnectAttempts = 0

// Netlify heartbeat state (serverless mode)
let heartbeatStarted = false
let heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null

// Smoothing for unstable Netlify Blobs counts (eventual consistency causes fluctuations)
const recentCounts: number[] = []
const SMOOTHING_WINDOW = 5 // Keep last 5 counts

/**
 * Reset all singleton state. Exported for tests only — avoids state leaking
 * between test cases when the module is shared across a test file.
 * @internal
 */
export function __resetForTest(): void {
  sharedInfo = { activeUsers: 0, totalConnections: 0 }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  pollStarted = false
  consecutiveFailures = 0
  hasFetchedOnce = false
  subscribers.clear()
  stateSubscribers.clear()
  if (presencePingInterval) { clearInterval(presencePingInterval); presencePingInterval = null }
  if (presenceReconnectTimer) { clearTimeout(presenceReconnectTimer); presenceReconnectTimer = null }
  if (presenceWs) { presenceWs.onclose = null; presenceWs.close(); presenceWs = null }
  presenceStarted = false
  presenceReconnectAttempts = 0
  if (heartbeatTimeoutId) { clearTimeout(heartbeatTimeoutId); heartbeatTimeoutId = null }
  heartbeatStarted = false
  recentCounts.length = 0
}

// Generate a unique session ID per browser tab (survives page navigation, not tab close)
function getSessionId(): string {
  let id = sessionStorage.getItem('kc-session-id')
  if (!id) {
    // crypto.randomUUID() requires a secure context (HTTPS / localhost).
    // Fall back to crypto.getRandomValues() for HTTP contexts where randomUUID is unavailable.
    if (typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID()
    } else {
      const arr = new Uint8Array(9)
      crypto.getRandomValues(arr)
      id = `${Date.now().toString(36)}-${Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('')}`
    }
    sessionStorage.setItem('kc-session-id', id)
  }
  return id
}

// Send heartbeat POST to Netlify Function
async function sendHeartbeat() {
  try {
    await fetch('/api/active-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ sessionId: getSessionId() }),
      signal: AbortSignal.timeout(5000)
    })
  } catch {
    // Best-effort — don't block on failure
  }
}

// Start heartbeat for Netlify (replaces WebSocket presence)
function startHeartbeat() {
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
function stopHeartbeat() {
  if (heartbeatTimeoutId) {
    clearTimeout(heartbeatTimeoutId)
    heartbeatTimeoutId = null
  }
  heartbeatStarted = false
}

// Tear down presence WebSocket connection
function stopPresenceConnection() {
  if (presenceReconnectTimer) {
    clearTimeout(presenceReconnectTimer)
    presenceReconnectTimer = null
  }
  if (presencePingInterval) {
    clearInterval(presencePingInterval)
    presencePingInterval = null
  }
  if (presenceWs) {
    presenceWs.onclose = null // Prevent reconnect from onclose handler
    presenceWs.close()
    presenceWs = null
  }
  presenceStarted = false
  // Reset reconnect attempts when stopping
  presenceReconnectAttempts = 0
}

// Start WebSocket presence connection (backend mode)
function startPresenceConnection() {
  if (presenceStarted) return

  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!token) return

  // Set flag AFTER token check so a missing token doesn't permanently block
  presenceStarted = true

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || (protocol === 'wss:' ? '443' : '80')}/ws`

  function connect() {
    try {
      presenceWs = new WebSocket(appendWsAuthToken(wsUrl))
    } catch {
      presenceStarted = false
      return
    }

    presenceWs.onopen = () => {
      // Reset reconnect attempts on successful connection
      presenceReconnectAttempts = 0
      // Read token fresh to avoid stale closure on reconnects
      const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN)
      presenceWs?.send(JSON.stringify({ type: 'auth', token: currentToken }))
      // Keep-alive ping every 30 seconds
      presencePingInterval = setInterval(() => {
        if (presenceWs?.readyState === WebSocket.OPEN) {
          presenceWs.send(JSON.stringify({ type: 'ping' }))
        }
      }, HEARTBEAT_INTERVAL)
    }

    presenceWs.onmessage = (event) => {
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
        console.warn('[ActiveUsers] Max reconnect attempts exceeded, giving up')
        return
      }

      const delay = getWsBackoffDelay(presenceReconnectAttempts)
      console.debug(`[ActiveUsers] Connection lost, reconnecting in ${Math.round(delay)}ms (attempt ${presenceReconnectAttempts + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

      // Reconnect after exponential backoff delay
      presenceReconnectTimer = setTimeout(() => {
        presenceReconnectTimer = null
        presenceReconnectAttempts++
        if (presenceStarted && localStorage.getItem(STORAGE_KEY_TOKEN)) connect()
      }, delay)
    }

    presenceWs.onerror = () => {
      presenceWs?.close()
    }
  }

  connect()
}

// Notify all subscribers
function notifySubscribers(state?: { loading?: boolean; error?: boolean }) {
  subscribers.forEach(fn => fn(sharedInfo))
  if (state) {
    stateSubscribers.forEach(fn => fn(state))
  }
}

// Fetch active users from API
async function fetchActiveUsers() {
  // Stop polling after too many consecutive failures, but schedule recovery
  if (consecutiveFailures >= MAX_FAILURES) {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
      pollStarted = false
    }
    notifySubscribers({ error: true })
    // Schedule a recovery attempt instead of dying permanently
    setTimeout(() => {
      consecutiveFailures = 0
      startPolling()
    }, RECOVERY_DELAY)
    return
  }

  try {
    const resp = await fetch('/api/active-users', { signal: AbortSignal.timeout(ACTIVE_USERS_FETCH_TIMEOUT_MS) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    // Guard: if the response is HTML (e.g. Netlify SPA catch-all returning
    // index.html because MSW hasn't intercepted yet), skip JSON parsing
    // entirely to avoid SyntaxError: Unexpected token '<' console noise.
    if (!isJsonResponse(resp)) throw new Error('Non-JSON response (likely HTML fallback)')
    // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
    // before the outer try/catch processes the rejection (microtask timing issue).
    const data = await resp.json().catch(() => null) as ActiveUsersInfo | null
    if (!data) throw new Error('Invalid JSON response')
    if (!Number.isFinite(data.activeUsers)) throw new Error('Invalid activeUsers value')
    consecutiveFailures = 0 // Reset on success

    // Smooth the count to handle Netlify Blobs eventual consistency fluctuations
    // Use the max of recent counts since undercounting is more common than overcounting
    recentCounts.push(data.activeUsers)
    if (recentCounts.length > SMOOTHING_WINDOW) recentCounts.shift()
    const smoothedCount = Math.max(...recentCounts)

    const smoothedData: ActiveUsersInfo = {
      activeUsers: smoothedCount,
      totalConnections: smoothedCount
    }

    const dataChanged = smoothedData.activeUsers !== sharedInfo.activeUsers ||
      smoothedData.totalConnections !== sharedInfo.totalConnections
    if (dataChanged) {
      sharedInfo = smoothedData
    }
    // Always notify on first success (clears loading state) or when data changes
    if (!hasFetchedOnce || dataChanged) {
      hasFetchedOnce = true
      notifySubscribers({ loading: false, error: false })
    }
  } catch {
    consecutiveFailures++
    // API not available, keep current state
    notifySubscribers({ error: consecutiveFailures >= MAX_FAILURES })
  }
}

// Start singleton polling
function startPolling() {
  if (pollStarted) return
  pollStarted = true
  consecutiveFailures = 0 // Reset failures on new start

  // Notify loading state
  notifySubscribers({ loading: true, error: false })

  // Initial fetch
  fetchActiveUsers()

  // Poll at interval (keep reference to clear if needed)
  pollInterval = setInterval(fetchActiveUsers, POLL_INTERVAL)
}

/**
 * Hook for tracking active users connected via WebSocket.
 * Returns viewerCount: totalConnections in demo mode, activeUsers in OAuth mode.
 */
export function useActiveUsers() {
  const [info, setInfo] = useState<ActiveUsersInfo>(sharedInfo)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  // Tick counter to force re-render when demo mode changes (so viewerCount recalculates)
  const [, setDemoTick] = useState(0)

  useEffect(() => {
    // On Netlify (no backend): use HTTP heartbeat for presence tracking
    // With backend: use WebSocket presence connection
    if (isDemoModeForced || getDemoMode()) {
      startHeartbeat()
    } else {
      startPresenceConnection()
    }
    startPolling()

    // Subscribe to updates
    const handleUpdate = (newInfo: ActiveUsersInfo) => {
      setInfo(newInfo)
    }
    const handleStateUpdate = (state: { loading?: boolean; error?: boolean }) => {
      if (state.loading !== undefined) setIsLoading(state.loading)
      if (state.error !== undefined) setHasError(state.error)
    }
    subscribers.add(handleUpdate)
    stateSubscribers.add(handleStateUpdate)

    // Sync initial state — if data was already fetched by another
    // hook instance, clear loading immediately so we don't get stuck
    setInfo(sharedInfo)
    if (hasFetchedOnce) {
      setIsLoading(false)
      setHasError(false)
    }

    // Re-render + refetch when demo mode toggles (viewerCount switches metric)
    const handleDemoChange = () => {
      setDemoTick(t => t + 1)
      fetchActiveUsers()
    }
    window.addEventListener('kc-demo-mode-change', handleDemoChange)

    // Recover polling when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        consecutiveFailures = 0
        if (!pollStarted) startPolling()
        else fetchActiveUsers()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscribers.delete(handleUpdate)
      stateSubscribers.delete(handleStateUpdate)
      window.removeEventListener('kc-demo-mode-change', handleDemoChange)
      document.removeEventListener('visibilitychange', handleVisibility)

      // Stop all singleton resources when no subscribers remain
      if (subscribers.size === 0) {
        if (pollInterval) {
          clearInterval(pollInterval)
          pollInterval = null
          pollStarted = false
        }
        stopHeartbeat()
        stopPresenceConnection()
      }
    }
  }, [])

  const refetch = () => {
    // Reset circuit breaker so manual refetch always works
    consecutiveFailures = 0
    if (!pollStarted) startPolling()
    else fetchActiveUsers()
  }

  // Demo mode: show total connections (sessions). OAuth mode: show unique users.
  const viewerCount = getDemoMode() ? info.totalConnections : info.activeUsers

  return {
    activeUsers: info.activeUsers,
    totalConnections: info.totalConnections,
    viewerCount,
    isLoading,
    hasError,
    refetch
  }
}
