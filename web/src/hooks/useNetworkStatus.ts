import { useState, useEffect, useRef } from 'react'

const RECONNECTED_DISPLAY_MS = 3000 // Show "reconnected" state for 3 seconds

// Global state for network status to ensure consistency across components
let globalOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
const listeners = new Set<(online: boolean) => void>()

function notifyListeners() {
  listeners.forEach(listener => listener(globalOnline))
}

// Initialize browser online/offline listeners at module load
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    globalOnline = true
    notifyListeners()
  })
  window.addEventListener('offline', () => {
    globalOnline = false
    notifyListeners()
  })
}

/**
 * Hook to track browser network connectivity.
 * Uses navigator.onLine + online/offline events for instant detection
 * of WiFi off, cable unplugged, airplane mode, etc.
 *
 * Returns:
 * - isOnline: current network status
 * - wasOffline: true for 3s after reconnection (for "reconnected" UI feedback)
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(globalOnline)
  const [wasOffline, setWasOffline] = useState(false)
  const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousOnlineRef = useRef(globalOnline)

  useEffect(() => {
    const handleChange = (online: boolean) => {
      const wasDisconnected = !previousOnlineRef.current
      previousOnlineRef.current = online
      setIsOnline(online)

      // If transitioning from offline to online, set wasOffline for brief feedback
      if (online && wasDisconnected) {
        setWasOffline(true)
        if (wasOfflineTimerRef.current) {
          clearTimeout(wasOfflineTimerRef.current)
        }
        wasOfflineTimerRef.current = setTimeout(() => {
          setWasOffline(false)
          wasOfflineTimerRef.current = null
        }, RECONNECTED_DISPLAY_MS)
      }
    }

    listeners.add(handleChange)
    setIsOnline(globalOnline)

    return () => {
      listeners.delete(handleChange)
      if (wasOfflineTimerRef.current) {
        clearTimeout(wasOfflineTimerRef.current)
      }
    }
  }, [])

  return {
    isOnline,
    wasOffline,
  }
}

/**
 * Get current network status without subscribing to changes.
 * Useful for one-time checks in non-React code.
 */
export function getNetworkStatus(): boolean {
  return globalOnline
}
