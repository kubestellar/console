import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  WorkloadMonitorResponse,
  MonitoredResource,
  MonitorIssue,
  ResourceHealthStatus,
} from '../types/workloadMonitor'
import { DEFAULT_REFRESH_MS } from '../types/workloadMonitor'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface UseWorkloadMonitorOptions {
  /** Auto-refresh interval in ms (default: 30000). Set to 0 to disable. */
  autoRefreshMs?: number
  /** Whether fetching is enabled (default: true) */
  enabled?: boolean
}

interface UseWorkloadMonitorResult {
  /** All monitored resources with health status */
  resources: MonitoredResource[]
  /** Detected issues across the workload */
  issues: MonitorIssue[]
  /** Overall workload health status */
  overallStatus: ResourceHealthStatus
  /** Workload kind (Deployment, StatefulSet, etc.) */
  workloadKind: string
  /** Non-critical warnings from the resolution */
  warnings: string[]
  /** Whether the initial load is in progress */
  isLoading: boolean
  /** Whether a refresh is in progress (data is still showing) */
  isRefreshing: boolean
  /** Error from the last fetch */
  error: Error | null
  /** Whether the data source has failed multiple times */
  isFailed: boolean
  /** Number of consecutive fetch failures */
  consecutiveFailures: number
  /** Timestamp of the last successful fetch */
  lastRefresh: Date | null
  /** Manually trigger a refresh */
  refetch: () => void
}

/**
 * Hook to monitor a workload's resources and health status.
 * Calls GET /api/workloads/monitor/:cluster/:namespace/:name with auto-refresh.
 */
export function useWorkloadMonitor(
  cluster?: string,
  namespace?: string,
  workload?: string,
  options?: UseWorkloadMonitorOptions,
): UseWorkloadMonitorResult {
  const refreshMs = options?.autoRefreshMs ?? DEFAULT_REFRESH_MS
  const enabled = options?.enabled !== false && !!cluster && !!namespace && !!workload

  const [resources, setResources] = useState<MonitoredResource[]>([])
  const [issues, setIssues] = useState<MonitorIssue[]>([])
  const [overallStatus, setOverallStatus] = useState<ResourceHealthStatus>('unknown')
  const [workloadKind, setWorkloadKind] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const hasLoadedOnce = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    if (!cluster || !namespace || !workload) return

    const isInitialLoad = !hasLoadedOnce.current
    if (isInitialLoad) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const res = await fetch(
        `/api/workloads/monitor/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(workload)}`,
        { headers: authHeaders() },
      )

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(errorData.error || `Monitor failed: ${res.statusText}`)
      }

      const data: WorkloadMonitorResponse = await res.json()
      setResources(data.resources)
      setIssues(data.issues)
      setOverallStatus(data.status)
      setWorkloadKind(data.kind)
      setWarnings(data.warnings)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      hasLoadedOnce.current = true
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Unknown error')
      setError(fetchError)
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace, workload])

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!enabled) {
      // Reset when disabled
      hasLoadedOnce.current = false
      setResources([])
      setIssues([])
      setOverallStatus('unknown')
      setWorkloadKind('')
      setWarnings([])
      setError(null)
      setConsecutiveFailures(0)
      return
    }

    fetchData()

    if (refreshMs > 0) {
      intervalRef.current = setInterval(fetchData, refreshMs)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, fetchData, refreshMs])

  const isFailed = consecutiveFailures >= 3

  return {
    resources,
    issues,
    overallStatus,
    workloadKind,
    warnings,
    isLoading,
    isRefreshing,
    error,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    refetch: fetchData,
  }
}
