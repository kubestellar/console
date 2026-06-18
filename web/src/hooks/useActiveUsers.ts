import { useState, useEffect } from 'react'
import { getDemoMode, isDemoModeForced } from './useDemoMode'
import {
  type ActiveUsersInfo,
  type ActiveUsersHookState,
  fetchActiveUsers,
  startPolling,
  stopPolling,
  abortActiveUsersFetch,
  notifySubscribers,
  resetPollingState,
  getSharedInfo,
  getHasFetchedOnce,
  resetConsecutiveFailures,
  getPollStarted,
  subscribers,
  stateSubscribers,
  ACTIVE_USERS_CACHE_TTL_MS,
  POLL_INTERVAL,
  MAX_FAILURES,
  RECOVERY_DELAY,
  SMOOTHING_WINDOW,
  ACTIVE_USERS_FETCH_MIN_INTERVAL_MS,
} from './presence/pollingTransport'
import {
  startPresenceConnection,
  stopPresenceConnection,
  getPresenceIsStale,
  resetWebSocketState,
  STALE_PRESENCE_TIMEOUT_MS,
} from './presence/websocketTransport'
import {
  startHeartbeat,
  stopHeartbeat,
  resetHeartbeatState,
  HEARTBEAT_INTERVAL,
  HEARTBEAT_MIN_INTERVAL_MS,
} from './presence/heartbeatTransport'
import { getSessionId } from './presence/sessionId'
import { isJsonResponse } from './presence/utils'

export type { ActiveUsersInfo }

/**
 * Disconnect the presence WebSocket and stop the heartbeat.
 * MUST be called during logout to prevent stale auth tokens from being
 * transmitted on a persistent connection after the user signs out (#4936).
 */
export function disconnectPresence(): void {
  stopPresenceConnection()
  stopHeartbeat()
}

/**
 * Reset all singleton state. Exported for tests only — avoids state leaking
 * between test cases when the module is shared across a test file.
 * @internal
 */
export function __resetForTest(): void {
  resetPollingState()
  resetWebSocketState()
  resetHeartbeatState()
}

/**
 * Hook for tracking active users connected via WebSocket.
 * Returns viewerCount: totalConnections in demo mode, activeUsers in OAuth mode.
 */
export function useActiveUsers() {
  const [info, setInfo] = useState<ActiveUsersInfo>(getSharedInfo())
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isStale, setIsStale] = useState(getPresenceIsStale())
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
    const handleStateUpdate = (state: ActiveUsersHookState) => {
      if (state.loading !== undefined) setIsLoading(state.loading)
      if (state.error !== undefined) setHasError(state.error)
      if (state.stale !== undefined) setIsStale(state.stale)
    }
    subscribers.add(handleUpdate)
    stateSubscribers.add(handleStateUpdate)

    // Sync initial state — if data was already fetched by another
    // hook instance, clear loading immediately so we don't get stuck
    setInfo(getSharedInfo())
    if (getHasFetchedOnce()) {
      setIsLoading(false)
      setHasError(false)
    }
    setIsStale(getPresenceIsStale())

    // Re-render + refetch when demo mode toggles (viewerCount switches metric)
    const handleDemoChange = () => {
      setDemoTick(t => t + 1)
      fetchActiveUsers()
    }
    window.addEventListener('kc-demo-mode-change', handleDemoChange)

    // Recover polling when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetConsecutiveFailures()
        if (!getPollStarted()) startPolling()
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
        stopPolling()
        abortActiveUsersFetch()
        stopHeartbeat()
        stopPresenceConnection()
      }
    }
  }, [])

  const refetch = () => {
    // Reset circuit breaker so manual refetch always works
    resetConsecutiveFailures()
    if (!getPollStarted()) startPolling()
    else fetchActiveUsers()
  }

  // Demo mode: show total connections (sessions). OAuth mode: show unique users.
  const viewerCount = getDemoMode() ? info.totalConnections : info.activeUsers

  return {
    activeUsers: info.activeUsers,
    totalConnections: info.totalConnections,
    viewerCount,
    isLoading,
    hasError: hasError || isStale,
    isStale,
    refetch
  }
}

export const __testables = {
  isJsonResponse,
  getSessionId,
  disconnectPresence,
  ACTIVE_USERS_CACHE_TTL_MS,
  POLL_INTERVAL,
  HEARTBEAT_INTERVAL,
  MAX_FAILURES,
  RECOVERY_DELAY,
  SMOOTHING_WINDOW,
  ACTIVE_USERS_FETCH_MIN_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  STALE_PRESENCE_TIMEOUT_MS,
}
