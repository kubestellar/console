/**
 * Manual hook registrations that need custom wrapper logic.
 */

import { MS_PER_HOUR } from '../../constants/time'
import { useCachedEvents } from '../../../hooks/useCachedData'
import { useFluxStatus } from '../../../components/cards/flux_status/useFluxStatus'
import { useContourStatus } from '../../../components/cards/contour_status/useContourStatus'
import { useChaosMeshStatus } from '../../../components/cards/chaos_mesh_status/useChaosMeshStatus'
import { DEMO_NAMESPACE_EVENTS } from './demoHooks-batch4'

/** Maximum namespace events to return when no namespace filter is set */
const MAX_NAMESPACE_EVENTS_UNFILTERED = 20

function useWarningEvents(params?: Record<string, unknown>) {
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

function useRecentEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const recentEvents = (() => {
    if (!result.data) return []
    const oneHourAgo = Date.now() - MS_PER_HOUR
    return result.data.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
  })()

  return {
    data: recentEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useNamespaceEvents(params?: Record<string, unknown>) {
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

function useUnifiedFluxStatus() {
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

function useUnifiedContourStatus() {
  const result = useContourStatus()
  return {
    data: result.data.proxies,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Contour status') : null,
    refetch: () => {},
  }
}

function useUnifiedChaosMeshStatus() {
  const result = useChaosMeshStatus()
  return {
    data: result.data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Chaos Mesh status') : null,
    refetch: () => { void result.refetch() },
  }
}

export const MANUAL_HOOKS = [
  { name: 'useWarningEvents', hook: useWarningEvents },
  { name: 'useRecentEvents', hook: useRecentEvents },
  { name: 'useNamespaceEvents', hook: useNamespaceEvents },
  { name: 'useFluxStatus', hook: useUnifiedFluxStatus },
  { name: 'useContourStatus', hook: useUnifiedContourStatus },
  { name: 'useChaosMeshStatus', hook: useUnifiedChaosMeshStatus },
]
