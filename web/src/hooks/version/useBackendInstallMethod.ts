import { useEffect, useRef } from 'react'
import type { InstallMethod } from '../../types/updates'
import { authFetch } from '../../lib/api'
import {
  HEALTH_FETCH_MAX_RETRIES,
  HEALTH_FETCH_RETRY_DELAY_MS,
  HEALTH_FETCH_TIMEOUT_MS,
  safeJsonParse,
} from '../versionUtils'

/**
 * Fetch the backend's install method from /health on mount, retrying up to
 * HEALTH_FETCH_MAX_RETRIES times while the backend comes online.
 * `setInstallMethod` must be a stable useState setter so this runs once.
 */
export function useBackendInstallMethod(setInstallMethod: (method: InstallMethod) => void) {
  const healthRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const clearHealthRetryTimer = () => {
      if (healthRetryTimerRef.current) {
        clearTimeout(healthRetryTimerRef.current)
        healthRetryTimerRef.current = null
      }
    }

    async function fetchBackendInstallMethod(attempt: number) {
      try {
        const response = await authFetch('/health', {
          signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
        })
        if (response.ok) {
          const data = await safeJsonParse<{ install_method?: string }>(response, 'Backend health')
          if (data.install_method && !cancelled) {
            setInstallMethod(data.install_method as InstallMethod)
            return
          }
        }
      } catch {
        // Backend not available.
      }

      if (attempt < HEALTH_FETCH_MAX_RETRIES && !cancelled) {
        clearHealthRetryTimer()
        healthRetryTimerRef.current = setTimeout(() => {
          healthRetryTimerRef.current = null
          void fetchBackendInstallMethod(attempt + 1)
        }, HEALTH_FETCH_RETRY_DELAY_MS)
      }
    }

    void fetchBackendInstallMethod(0)
    return () => {
      cancelled = true
      clearHealthRetryTimer()
    }
  }, [setInstallMethod])
}
