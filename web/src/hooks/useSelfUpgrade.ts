import { useState, useEffect, useCallback, useRef } from 'react'
import type { SelfUpgradeStatus } from '../types/updates'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { setUpgradeState } from '../lib/upgradeState'

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
  /** Track active polling interval IDs to prevent duplicate loops (#7789) */
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Fetch self-upgrade availability from the backend */
  const checkStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = getToken()
      const resp = await fetch('/api/self-upgrade/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(SELF_UPGRADE_TIMEOUT_MS) })
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

  /** Elapsed-seconds tick interval (ms) */
  const ELAPSED_TICK_MS = 1_000

  /** Poll /health until the backend responds, then reload the page */
  const pollForRestart = () => {
    // Clear any existing polling loops before starting new ones (#7789)
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
    pollAbortRef.current?.abort()

    setIsRestarting(true)
    setRestartComplete(false)
    setRestartError(null)
    setRestartElapsed(0)
    setUpgradeState({ phase: 'restarting' })

    const controller = new AbortController()
    pollAbortRef.current = controller

    const startTime = Date.now()

    tickIntervalRef.current = setInterval(() => {
      setRestartElapsed(Math.floor((Date.now() - startTime) / ELAPSED_TICK_MS))
    }, ELAPSED_TICK_MS)

    // Use a non-async wrapper to prevent unhandled promise rejections from setInterval (#7788)
    pollIntervalRef.current = setInterval(() => {
      if (controller.signal.aborted) {
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
        if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
        return
      }

      // Timed out waiting
      if (Date.now() - startTime > RESTART_POLL_MAX_MS) {
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
        if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
        setIsRestarting(false)
        setRestartError('The console did not come back within the expected time. Try refreshing manually.')
        setUpgradeState({ phase: 'error', errorMessage: 'The console did not come back within the expected time.' })
        return
      }

      void (async () => {
        try {
          const resp = await fetch('/health', {
            signal: AbortSignal.timeout(RESTART_HEALTH_TIMEOUT_MS) })
          if (resp.ok) {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
            if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
            setIsRestarting(false)
            setRestartComplete(true)
            setUpgradeState({ phase: 'complete' })
            // Auto-reload after a brief pause so the user sees the success state
            setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
          }
        } catch {
          // Expected — pod is still restarting
        }
      })()
    }, RESTART_POLL_INTERVAL_MS)

    // Cleanup on unmount
    return () => {
      controller.abort()
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
      if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
    }
  }

  /** Trigger the self-upgrade by patching the Deployment image tag */
  const triggerUpgrade = async (imageTag: string): Promise<{ success: boolean; error?: string }> => {
    setIsTriggering(true)
    setTriggerError(null)
    setUpgradeState({ phase: 'triggering' })
    try {
      const token = getToken()
      const resp = await fetch('/api/self-upgrade/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ imageTag }),
        signal: AbortSignal.timeout(SELF_UPGRADE_TIMEOUT_MS) })
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
      setUpgradeState({ phase: 'error', errorMessage: errorMsg })
      return { success: false, error: errorMsg }
    } catch (err: unknown) {
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
      setUpgradeState({ phase: 'error', errorMessage: msg })
      return { success: false, error: msg }
    }
  }

  /** Cancel restart polling (e.g. user navigates away) */
  const cancelRestartPoll = () => {
    pollAbortRef.current?.abort()
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
    setIsRestarting(false)
  }

  // Check status on mount
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
      if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
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
    cancelRestartPoll }
}

export const __testables = {
  getToken,
  SELF_UPGRADE_TIMEOUT_MS,
  RESTART_POLL_INTERVAL_MS,
  RESTART_POLL_MAX_MS,
  RESTART_HEALTH_TIMEOUT_MS,
  RELOAD_DELAY_MS,
}
