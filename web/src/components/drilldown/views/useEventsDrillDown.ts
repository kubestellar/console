import { useState, useEffect, useCallback, useRef } from 'react'
import { getDemoMode } from '../../../hooks/useDemoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { POLL_INTERVAL_MS, UI_FEEDBACK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { agentFetch } from '../../../hooks/mcp/shared'
import { copyToClipboard } from '../../../lib/clipboard'

export interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster: string
  count: number
  age?: string
  firstSeen?: string
  lastSeen?: string
}

export type TypeFilter = 'all' | 'Warning' | 'Normal'

export interface UseEventsDrillDownResult {
  events: ClusterEvent[]
  isLoading: boolean
  error: string | null
  copied: boolean
  refetch: (silent?: boolean) => Promise<void>
  copyCommand: () => void
}

/**
 * Owns all remote data loading for the Events drill-down
 * so the view component stays presentational.
 */
export function useEventsDrillDown(
  clusterShort: string,
  namespace: string | undefined,
  objectName: string | undefined
): UseEventsDrillDownResult {
  const [events, setEvents] = useState<ClusterEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch events from local agent (no auth required)
  const refetch = useCallback(async (silent = false) => {
    // Skip agent requests in demo mode (no local agent on Netlify)
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      // Use local agent - for node events, check default namespace with higher limit
      const params = new URLSearchParams()
      params.append('cluster', clusterShort)
      // For node events, use default namespace where node events are stored
      if (objectName && !namespace) {
        params.append('namespace', 'default')
      } else if (namespace) {
        params.append('namespace', namespace)
      }
      if (objectName) {
        params.append('object', objectName)
      }
      params.append('limit', '100')

      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/events?${params}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      } else {
        setError('Failed to fetch events')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [clusterShort, namespace, objectName])

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    refetch()
    refreshIntervalRef.current = setInterval(() => refetch(true), POLL_INTERVAL_MS)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [refetch])

  const copyCommand = useCallback(() => {
    const cmd = objectName
      ? `kubectl --context ${clusterShort} get events --field-selector involvedObject.name=${objectName}${namespace ? ` -n ${namespace}` : ''}`
      : `kubectl --context ${clusterShort} get events${namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp`
    copyToClipboard(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }, [clusterShort, namespace, objectName])

  return {
    events,
    isLoading,
    error,
    copied,
    refetch,
    copyCommand,
  }
}
