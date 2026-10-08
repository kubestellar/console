import { useEffect, useRef } from 'react'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import type { GPUHealthCheckResult } from '../hooks/mcp/types'
import type { NightlyGuideStatus } from '../lib/llmd/nightlyE2EDemoData'
import { INITIAL_FETCH_DELAY_MS, POLL_INTERVAL_SLOW_MS, SECONDARY_FETCH_DELAY_MS, NIGHTLY_E2E_POLL_INTERVAL_MS, FETCH_DEFAULT_TIMEOUT_MS, areOptionalPollersSuppressed } from '../lib/constants/network'
import { safeGet } from '../lib/safeLocalStorage'
import { STORAGE_KEY_AUTH_TOKEN } from '../lib/constants/storage'

/** Polls optional GPU cronjob and nightly E2E data into refs read by alert evaluation. */
export function useAlertsOptionalPollers(clustersRef: { readonly current: ReadonlyArray<{ name: string }> }) {
  const cronJobResultsRef = useRef<Record<string, GPUHealthCheckResult[]>>({})
  const nightlyE2ERef = useRef<NightlyGuideStatus[]>([])

  useEffect(() => {
    if (areOptionalPollersSuppressed()) return

    let unmounted = false
    const fetchCronJobResults = async () => {
      const token = safeGet(STORAGE_KEY_AUTH_TOKEN)
      if (!token || unmounted) return
      const currentClusters = clustersRef.current
      if (!currentClusters.length) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const settled = await settledWithConcurrency(
        currentClusters.map(cluster => async () => {
          try {
            const resp = await fetch(
              `${API_BASE}/api/mcp/gpu-nodes/health/cronjob/results?cluster=${encodeURIComponent(cluster.name)}`,
              { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
            )
            if (resp.ok) {
              const data = await resp.json().catch(() => null)
              if (data?.results && data.results.length > 0) {
                return { cluster: cluster.name, data: data.results as GPUHealthCheckResult[] }
              }
            }
          } catch {
            // Silent — CronJob may not be installed on this cluster
          }
          return null
        })
      )

      const results: Record<string, GPUHealthCheckResult[]> = {}
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results[result.value.cluster] = result.value.data
        }
      }

      if (!unmounted) {
        cronJobResultsRef.current = results
      }
    }

    const timer = setTimeout(fetchCronJobResults, INITIAL_FETCH_DELAY_MS)
    const interval = setInterval(fetchCronJobResults, POLL_INTERVAL_SLOW_MS)
    return () => {
      unmounted = true
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (areOptionalPollersSuppressed()) return

    let unmounted = false
    const fetchNightlyE2E = async () => {
      if (unmounted) return
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
        const resp = await fetch(`${API_BASE}/api/public/nightly-e2e/runs`, {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (resp.ok && !unmounted) {
          const data = await resp.json().catch(() => null)
          if (Array.isArray(data)) {
            nightlyE2ERef.current = data
          }
        }
      } catch {
        // Silent — nightly E2E data is optional
      }
    }

    const timer = setTimeout(fetchNightlyE2E, SECONDARY_FETCH_DELAY_MS)
    const interval = setInterval(fetchNightlyE2E, NIGHTLY_E2E_POLL_INTERVAL_MS)
    return () => {
      unmounted = true
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [])

  return { cronJobResultsRef, nightlyE2ERef }
}
