import { useState, useEffect, useCallback, useRef } from 'react'
import type { SelfUpgradeStatus } from '../types/updates'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

/** Timeout for self-upgrade API calls (ms) */
const SELF_UPGRADE_TIMEOUT_MS = 15_000

/** Interval between health polls while waiting for restart (ms) */
const RESTART_POLL_INTERVAL_MS = 3_000

/** Maximum time to wait for the pod to come back after upgrade (ms) */
const RESTART_POLL_MAX_MS = 120_000

/** Short timeout for health probes during restart polling (ms) */
const RESTART_HEALTH_TIMEOUT_MS = 3_000

/** Delay before auto-reload so the user sees the success state (ms) */
const RELOAD_DELAY_MS = 1_500

/** Read the JWT token from localStorage for authenticated API calls */
const getToken = () => localStorage.getItem(STORAGE_KEY_TOKEN)

/**
 * Hook for Helm self-upgrade via Deployment image patch.
 *
 * Checks if the backend supports self-upgrade (in-cluster + RBAC),
 * provides a trigger function to initiate the upgrade,
 * and polls for restart completion after a successful trigger.
 */
export function useSelfUpgrade() {
  const [status, setStatus] = useState<SelfUpgradeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  /** Whether we're waiting for the pod to restart after a successful trigger */
  const [isRestarting, setIsRestarting] = useState(false)
  /** Whether the pod came back successfully after restart */
  const [restartComplete, setRestartComplete] = useState(false)
  /** Error if the pod didn't come back in time */
  const [restartError, setRestartError] = useState<string | null>(null)
  /** Elapsed seconds since restart began (for display) */
  const [restartElapsed, setRestartElapsed] = useState(0)

  const pollAbortRef = useRef<AbortController | null>(null)

  /** Fetch self-upgrade availability from the backend */
  const checkStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = getToken()
      const resp = await fetch('/api/self-upgrade/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(SELF_UPGRADE_TIMEOUT_MS),
      })
      if (resp.ok) {
        const data = (await resp.json()) as SelfUpgradeStatus
        setStatus(data)
      } else {
        setStatus(null)
      }
    } catch {
      setStatus(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /** Poll /health until the backend responds, then reload the page */
  const pollForRestart = useCallback(() => {
    setIsRestarting(true)
    setRestartComplete(false)
    setRestartError(null)
    setRestartElapsed(0)

    const controller = new AbortController()
    pollAbortRef.current = controller

    const startTime = Date.now()

    const tick = setInterval(() => {
      setRestartElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    const poll = setInterval(async () => {
      if (controller.signal.aborted) {
        clearInterval(poll)
        clearInterval(tick)
        return
      }

      // Timed out waiting
      if (Date.now() - startTime > RESTART_POLL_MAX_MS) {
        clearInterval(poll)
        clearInterval(tick)
        setIsRestarting(false)
        setRestartError('The console did not come back within the expected time. Try refreshing manually.')
        return
      }

      try {
        const resp = await fetch('/health', {
          signal: AbortSignal.timeout(RESTART_HEALTH_TIMEOUT_MS),
        })
        if (resp.ok) {
          clearInterval(poll)
          clearInterval(tick)
          setIsRestarting(false)
          setRestartComplete(true)
          // Auto-reload after a brief pause so the user sees the success state
          setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
        }
      } catch {
        // Expected — pod is still restarting
      }
    }, RESTART_POLL_INTERVAL_MS)

    // Cleanup on unmount
    return () => {
      controller.abort()
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  /** Trigger the self-upgrade by patching the Deployment image tag */
  const triggerUpgrade = useCallback(async (imageTag: string): Promise<{ success: boolean; error?: string }> => {
    setIsTriggering(true)
    setTriggerError(null)
    try {
      const token = getToken()
      const resp = await fetch('/api/self-upgrade/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageTag }),
        signal: AbortSignal.timeout(SELF_UPGRADE_TIMEOUT_MS),
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setIsTriggering(false)
        // Start polling for restart
        pollForRestart()
        return { success: true }
      }
      const errorMsg = data.error ?? `Server returned ${resp.status}`
      setTriggerError(errorMsg)
      setIsTriggering(false)
      return { success: false, error: errorMsg }
    } catch (err) {
      // If the trigger request itself fails (connection lost mid-request),
      // the patch likely succeeded and the pod is already restarting
      const msg = err instanceof Error ? err.message : 'Failed to reach backend'
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('AbortError') || msg.includes('timeout')) {
        setIsTriggering(false)
        pollForRestart()
        return { success: true }
      }
      setTriggerError(msg)
      setIsTriggering(false)
      return { success: false, error: msg }
    }
  }, [pollForRestart])

  /** Cancel restart polling (e.g. user navigates away) */
  const cancelRestartPoll = useCallback(() => {
    pollAbortRef.current?.abort()
    setIsRestarting(false)
  }, [])

  // Check status on mount
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  return {
    /** Self-upgrade status from backend (null if not available or not checked) */
    status,
    /** Whether the status check is in progress */
    isLoading,
    /** Whether self-upgrade is available (in-cluster + RBAC) */
    isAvailable: status?.available ?? false,
    /** Whether the trigger request is in progress */
    isTriggering,
    /** Error from the last trigger attempt */
    triggerError,
    /** Whether we're waiting for the pod to restart after upgrade */
    isRestarting,
    /** Whether the pod came back successfully */
    restartComplete,
    /** Error if pod didn't come back in time */
    restartError,
    /** Seconds elapsed since restart began */
    restartElapsed,
    /** Re-check self-upgrade availability */
    checkStatus,
    /** Trigger the upgrade with a specific image tag */
    triggerUpgrade,
    /** Cancel restart polling */
    cancelRestartPoll,
  }
}
