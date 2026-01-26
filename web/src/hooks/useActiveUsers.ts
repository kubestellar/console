import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export interface ActiveUsersInfo {
  activeUsers: number
  totalConnections: number
}

const POLL_INTERVAL = 30000 // Poll every 30 seconds

// Singleton state to share across all hook instances
let sharedInfo: ActiveUsersInfo = {
  activeUsers: 0,
  totalConnections: 0,
}
let pollStarted = false
let pollInterval: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0
const MAX_FAILURES = 3
let subscribers = new Set<(info: ActiveUsersInfo) => void>()

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(sharedInfo))
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
    return
  }

  try {
    const { data } = await api.get<ActiveUsersInfo>('/api/active-users')
    consecutiveFailures = 0 // Reset on success
    if (data.activeUsers !== sharedInfo.activeUsers ||
        data.totalConnections !== sharedInfo.totalConnections) {
      sharedInfo = data
      notifySubscribers()
    }
  } catch {
    consecutiveFailures++
    // API not available, keep current state
  }
}

// Start singleton polling
function startPolling() {
  if (pollStarted) return
  pollStarted = true
  consecutiveFailures = 0 // Reset failures on new start

  // Initial fetch
  fetchActiveUsers()

  // Poll at interval (keep reference to clear if needed)
  pollInterval = setInterval(fetchActiveUsers, POLL_INTERVAL)
}

/**
 * Hook for tracking active users connected via WebSocket
 */
export function useActiveUsers() {
  const [info, setInfo] = useState<ActiveUsersInfo>(sharedInfo)

  useEffect(() => {
    // Start polling (only happens once across all instances)
    startPolling()

    // Subscribe to updates
    const handleUpdate = (newInfo: ActiveUsersInfo) => {
      setInfo(newInfo)
    }
    subscribers.add(handleUpdate)

    // Set initial state
    setInfo(sharedInfo)

    return () => {
      subscribers.delete(handleUpdate)
    }
  }, [])

  const refetch = useCallback(() => {
    fetchActiveUsers()
  }, [])

  return {
    activeUsers: info.activeUsers,
    totalConnections: info.totalConnections,
    // Show badge if any users are connected (including yourself)
    showBadge: info.activeUsers >= 1 || info.totalConnections >= 1,
    refetch,
  }
}
