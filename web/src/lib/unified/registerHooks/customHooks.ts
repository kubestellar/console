/**
 * Manually composed unified hooks.
 */

import { useMemo, useState, useEffect } from 'react'
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from '../../constants/time'
import { useCachedEvents } from '../../../hooks/useCachedData'
import { useFluxStatus } from '../../../components/cards/flux_status/useFluxStatus'
import { useContourStatus } from '../../../components/cards/contour_status/useContourStatus'
import { useChaosMeshStatus } from '../../../components/cards/chaos_mesh_status/useChaosMeshStatus'
// ============================================================================
// Filtered event hooks and manual status hooks
// ============================================================================

/** Maximum namespace events to return when no namespace filter is set */
const MAX_NAMESPACE_EVENTS_UNFILTERED = 20
const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND

const DEMO_NAMESPACE_EVENTS = [
  {
    type: 'Normal',
    reason: 'Scheduled',
    message: 'Pod scheduled',
    object: 'pod/api-7d8f',
    namespace: 'production',
    count: 1,
    lastSeen: Date.now() - THIRTY_SECONDS_MS,
  },
  {
    type: 'Warning',
    reason: 'BackOff',
    message: 'Container restarting',
    object: 'pod/worker-5c6d',
    namespace: 'production',
    count: 5,
    lastSeen: Date.now() - MS_PER_MINUTE,
  },
]

export function useWarningEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const warningEvents = (() => {
    if (!result.data) return []
    return result.data.filter(e => e.type === 'Warning')
  })()

  return {
    data: warningEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

export function useRecentEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const [cutoffTime, setCutoffTime] = useState(() => Date.now() - MS_PER_HOUR)

  useEffect(() => {
    const interval = setInterval(() => {
      setCutoffTime(Date.now() - MS_PER_HOUR)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const recentEvents = useMemo(() => {
    if (!result.data) return []
    return result.data.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= cutoffTime
    })
  }, [result.data, cutoffTime])

  return {
    data: recentEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

export function useNamespaceEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const namespaceEvents = (() => {
    if (!result.data) return []
    if (!namespace) return result.data.slice(0, MAX_NAMESPACE_EVENTS_UNFILTERED)
    return result.data.filter(e => e.namespace === namespace)
  })()

  return {
    data: namespaceEvents.length > 0 ? namespaceEvents : DEMO_NAMESPACE_EVENTS,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

export function useUnifiedFluxStatus() {
  const result = useFluxStatus()
  const data = [
    ...result.data.resources.sources,
    ...result.data.resources.kustomizations,
    ...result.data.resources.helmReleases,
  ]

  return {
    data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Flux status') : null,
    refetch: () => {},
  }
}

export function useUnifiedContourStatus() {
  const result = useContourStatus()
  return {
    data: result.data.proxies,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Contour status') : null,
    refetch: () => {},
  }
}

export function useUnifiedChaosMeshStatus() {
  const result = useChaosMeshStatus()
  return {
    data: result.data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Chaos Mesh status') : null,
    refetch: () => { void result.refetch() },
  }
}
