import { useState, useEffect, useCallback } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { agentFetch } from '../shared'
import { type UsePodLogsResult } from './shared'

// ---------------------------------------------------------------------------
// usePodLogs
// ---------------------------------------------------------------------------

/** Default tail line count when caller does not specify one (matches backend default). */
export const USE_POD_LOGS_DEFAULT_TAIL = 100

export function usePodLogs(cluster: string, namespace: string, pod: string, container?: string, tail = USE_POD_LOGS_DEFAULT_TAIL): UsePodLogsResult {
  const [logs, setLogs] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster || !namespace || !pod) {
      // Clear any stale state when required inputs are missing so the UI
      // doesn't continue to show logs from a previously selected pod.
      setLogs('')
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      params.append('namespace', namespace)
      params.append('pod', pod)
      if (container) params.append('container', container)
      params.append('tail', tail.toString())
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pods/logs?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setLogs(data.logs || '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      setLogs('')
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, pod, container, tail])

  // Re-fetch whenever cluster/namespace/pod/container/tail change. A previous
  // implementation guarded this with a `useRef(false)` latch that only fired
  // once, which meant switching pods in the Logs dashboard never refreshed
  // the displayed logs.
  useEffect(() => {
    refetch()
  }, [refetch])

  return { logs, isLoading, error, refetch }
}
