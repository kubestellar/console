import { useState, useEffect, useCallback } from 'react'
import { getDemoMode, isDemoModeForced } from './useDemoMode'

export interface ActiveUsersInfo {
  activeUsers: number
  totalConnections: number
}

const POLL_INTERVAL = 10000 // Poll every 10 seconds
const HEARTBEAT_INTERVAL = 30000 // Heartbeat every 30 seconds
const WS_RECONNECT_DELAY = 5000

// Singleton state to share across all hook instances
let sharedInfo: ActiveUsersInfo = {
  activeUsers: 0,
  totalConnections: 0,
}
let pollStarted = false
let pollInterval: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0
const MAX_FAILURES = 3
const subscribers = new Set<(info: ActiveUsersInfo) => void>()
const stateSubscribers = new Set<(state: { loading?: boolean; error?: boolean }) => void>()

// Singleton presence WebSocket connection (backend mode)
let presenceWs: WebSocket | null = null
let presenceStarted = false
let presencePingInterval: ReturnType<typeof setInterval> | null = null

// Netlify heartbeat state (serverless mode)
let heartbeatStarted = false

// Generate a unique session ID per browser tab (survives page navigation, not tab close)
function getSessionId(): string {
  let id = sessionStorage.getItem('kc-session-id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('kc-session-id', id)
  }
  return id
}

// Send heartbeat POST to Netlify Function
async function sendHeartbeat() {
  try {
    await fetch('/api/active-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId() }),
      signal: AbortSignal.timeout(5000),
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
  sendHeartbeat().then(() => fetchActiveUsers())

  setInterval(() => {
    sendHeartbeat()
  }, HEARTBEAT_INTERVAL)
}

// Start WebSocket presence connection (backend mode)
function startPresenceConnection() {
  if (presenceStarted) return

  const token = localStorage.getItem('token')
  if (!token) return

  // Set flag AFTER token check so a missing token doesn't permanently block
  presenceStarted = true

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || (protocol === 'wss:' ? '443' : '80')}/ws`

  function connect() {
    try {
      presenceWs = new WebSocket(wsUrl)
    } catch {
      presenceStarted = false
      return
    }

    presenceWs.onopen = () => {
      // Authenticate with the hub
      presenceWs?.send(JSON.stringify({ type: 'auth', token }))
      // Keep-alive ping every 30 seconds
      presencePingInterval = setInterval(() => {
        if (presenceWs?.readyState === WebSocket.OPEN) {
          presenceWs.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
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
      // Reconnect after delay
      setTimeout(() => {
        if (presenceStarted && localStorage.getItem('token')) connect()
      }, WS_RECONNECT_DELAY)
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
  // Stop trying after too many consecutive failures
  if (consecutiveFailures >= MAX_FAILURES) {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
      pollStarted = false
    }
    notifySubscribers({ error: true })
    return
  }

  try {
    const resp = await fetch('/api/active-users', { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: ActiveUsersInfo = await resp.json()
    consecutiveFailures = 0 // Reset on success
    if (data.activeUsers !== sharedInfo.activeUsers ||
        data.totalConnections !== sharedInfo.totalConnections) {
      sharedInfo = data
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
    if (isDemoModeForced) {
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

    // Set initial state
    setInfo(sharedInfo)

    // Re-render + refetch when demo mode toggles (viewerCount switches metric)
    const handleDemoChange = () => {
      setDemoTick(t => t + 1)
      fetchActiveUsers()
    }
    window.addEventListener('kc-demo-mode-change', handleDemoChange)

    return () => {
      subscribers.delete(handleUpdate)
      stateSubscribers.delete(handleStateUpdate)
      window.removeEventListener('kc-demo-mode-change', handleDemoChange)
    }
  }, [])

  const refetch = useCallback(() => {
    fetchActiveUsers()
  }, [])

  // Demo mode: show total connections (sessions). OAuth mode: show unique users.
  const viewerCount = getDemoMode() ? info.totalConnections : info.activeUsers

  return {
    activeUsers: info.activeUsers,
    totalConnections: info.totalConnections,
    viewerCount,
    isLoading,
    hasError,
    refetch,
  }
}
