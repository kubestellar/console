import { useState, useEffect, useCallback } from 'react'
import type { SelfUpgradeStatus } from '../types/updates'

/** Timeout for self-upgrade API calls (ms) */
const SELF_UPGRADE_TIMEOUT_MS = 15_000

/**
 * Hook for Helm self-upgrade via Deployment image patch.
 *
 * Checks if the backend supports self-upgrade (in-cluster + RBAC),
 * and provides a trigger function to initiate the upgrade.
 */
export function useSelfUpgrade() {
  const [status, setStatus] = useState<SelfUpgradeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  /** Fetch self-upgrade availability from the backend */
  const checkStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const resp = await fetch('/api/self-upgrade/status', {
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

  /** Trigger the self-upgrade by patching the Deployment image tag */
  const triggerUpgrade = useCallback(async (imageTag: string): Promise<{ success: boolean; error?: string }> => {
    setIsTriggering(true)
    setTriggerError(null)
    try {
      const resp = await fetch('/api/self-upgrade/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageTag }),
        signal: AbortSignal.timeout(SELF_UPGRADE_TIMEOUT_MS),
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        return { success: true }
      }
      const errorMsg = data.error ?? `Server returned ${resp.status}`
      setTriggerError(errorMsg)
      return { success: false, error: errorMsg }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach backend'
      setTriggerError(msg)
      return { success: false, error: msg }
    } finally {
      setIsTriggering(false)
    }
  }, [])

  // Check status on mount
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

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
    /** Re-check self-upgrade availability */
    checkStatus,
    /** Trigger the upgrade with a specific image tag */
    triggerUpgrade,
  }
}
