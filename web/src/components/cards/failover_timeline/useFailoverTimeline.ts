import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  FAILOVER_TIMELINE_DEMO_DATA,
  type FailoverTimelineData,
  type FailoverEvent,
  type FailoverEventType,
  type FailoverSeverity,
} from './demoData'

export type { FailoverTimelineData, FailoverEvent }

/** Default count value when a field is missing or empty */
const DEFAULT_COUNT = 0

/** Window (in ms) for correlating a cluster NotReady event with binding reschedules */
const CORRELATION_WINDOW_MS = 5 * 60 * 1_000

const CACHE_KEY = 'failover-timeline'

const INITIAL_DATA: FailoverTimelineData = {
  events: [],
  activeClusters: DEFAULT_COUNT,
  totalClusters: DEFAULT_COUNT,
  lastFailover: null,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
}

interface CRResponse {
  items?: CRItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely extracts a Record from unknown */
function getRecord(val: unknown): Record<string, unknown> {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  return {}
}

/** Safely extracts an Array from unknown */
function getArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : []
}

// ---------------------------------------------------------------------------
// CRD fetcher (same pattern as karmada_status)
// ---------------------------------------------------------------------------

async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`/api/mcp/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: CRResponse = await resp.json()
    return body.items ?? []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Condition parsing
// ---------------------------------------------------------------------------

interface ConditionTransition {
  clusterName: string
  type: string
  status: string
  lastTransitionTime: string
}

function parseClusterConditions(items: CRItem[]): ConditionTransition[] {
  const transitions: ConditionTransition[] = []
  for (const item of items) {
    const statusObj = getRecord(item.status)
    const conditions = getArray(statusObj.conditions)
    for (const c of conditions) {
      const cond = getRecord(c)
      if (cond.type === 'Ready' && typeof cond.lastTransitionTime === 'string') {
        transitions.push({
          clusterName: item.name,
          type: 'Ready',
          status: String(cond.status ?? 'Unknown'),
          lastTransitionTime: cond.lastTransitionTime,
        })
      }
    }
  }
  return transitions
}

interface BindingTransition {
  bindingName: string
  namespace: string
  resourceKind: string
  clusters: string[]
  scheduledTime: string | null
  isRescheduled: boolean
}

function parseBindingTransitions(items: CRItem[]): BindingTransition[] {
  const results: BindingTransition[] = []
  for (const item of items) {
    const spec = getRecord(item.spec)
    const status = getRecord(item.status)
    const conditions = getArray(status.conditions)

    const resourceDef = getRecord(spec.resource)
    const resourceKind = typeof resourceDef.kind === 'string' ? resourceDef.kind : ''

    const specClusters = getArray(spec.clusters)
    const boundClusters = specClusters.map(c => {
      const obj = getRecord(c)
      return typeof obj.name === 'string' ? obj.name : ''
    }).filter(Boolean)

    let scheduledTime: string | null = null
    let isRescheduled = false

    for (const c of conditions) {
      const cond = getRecord(c)
      if (cond.type === 'Scheduled' && cond.status === 'True' && typeof cond.lastTransitionTime === 'string') {
        scheduledTime = cond.lastTransitionTime
      }
      // A binding with reason "Rescheduling" indicates failover
      if (typeof cond.reason === 'string' && cond.reason.toLowerCase().includes('reschedul')) {
        isRescheduled = true
      }
    }

    results.push({
      bindingName: item.name,
      namespace: item.namespace ?? '',
      resourceKind,
      clusters: boundClusters,
      scheduledTime,
      isRescheduled,
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Event correlation
// ---------------------------------------------------------------------------

function correlateEvents(
  clusterTransitions: ConditionTransition[],
  bindingTransitions: BindingTransition[],
): FailoverEvent[] {
  const events: FailoverEvent[] = []

  // Identify cluster down/recovery events
  for (const ct of clusterTransitions) {
    const transitionMs = new Date(ct.lastTransitionTime).getTime()
    if (isNaN(transitionMs)) continue

    if (ct.status === 'False' || ct.status === 'Unknown') {
      // Cluster went down
      events.push({
        timestamp: ct.lastTransitionTime,
        eventType: 'cluster_down' as FailoverEventType,
        cluster: ct.clusterName,
        workload: '',
        details: `Cluster transitioned to ${ct.status === 'False' ? 'NotReady' : 'Unknown'} state`,
        severity: 'critical' as FailoverSeverity,
      })

      // Find binding reschedules within the correlation window
      for (const bt of bindingTransitions) {
        if (!bt.scheduledTime) continue
        const bindingMs = new Date(bt.scheduledTime).getTime()
        if (isNaN(bindingMs)) continue

        const delta = bindingMs - transitionMs
        if (delta >= 0 && delta <= CORRELATION_WINDOW_MS) {
          const targetCluster = bt.clusters.length > 0 ? bt.clusters[0] : 'unknown'
          events.push({
            timestamp: bt.scheduledTime,
            eventType: 'binding_reschedule' as FailoverEventType,
            cluster: targetCluster,
            workload: bt.resourceKind ? `${bt.resourceKind}/${bt.bindingName}` : bt.bindingName,
            details: `ResourceBinding rescheduled from ${ct.clusterName} to ${targetCluster}`,
            severity: 'warning' as FailoverSeverity,
          })
        }
      }
    } else if (ct.status === 'True') {
      // Cluster recovered
      events.push({
        timestamp: ct.lastTransitionTime,
        eventType: 'cluster_recovery' as FailoverEventType,
        cluster: ct.clusterName,
        workload: '',
        details: 'Cluster returned to Ready state',
        severity: 'info' as FailoverSeverity,
      })
    }
  }

  // Identify standalone rescheduled bindings not already correlated
  for (const bt of bindingTransitions) {
    if (!bt.isRescheduled || !bt.scheduledTime) continue
    const bindingMs = new Date(bt.scheduledTime).getTime()
    if (isNaN(bindingMs)) continue

    const alreadyCorrelated = events.some(
      e => e.eventType === 'binding_reschedule' && e.timestamp === bt.scheduledTime,
    )
    if (alreadyCorrelated) continue

    const targetCluster = bt.clusters.length > 0 ? bt.clusters[0] : 'unknown'
    events.push({
      timestamp: bt.scheduledTime,
      eventType: 'binding_reschedule' as FailoverEventType,
      cluster: targetCluster,
      workload: bt.resourceKind ? `${bt.resourceKind}/${bt.bindingName}` : bt.bindingName,
      details: `ResourceBinding rescheduled to ${targetCluster}`,
      severity: 'warning' as FailoverSeverity,
    })
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return events
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchFailoverTimeline(): Promise<FailoverTimelineData> {
  const [clusterItems, bindingItems] = await Promise.all([
    fetchCR('cluster.karmada.io', 'v1alpha1', 'clusters'),
    fetchCR('work.karmada.io', 'v1alpha2', 'resourcebindings'),
  ])

  if (clusterItems.length === 0 && bindingItems.length === 0) {
    return {
      ...INITIAL_DATA,
      lastCheckTime: new Date().toISOString(),
    }
  }

  const clusterTransitions = parseClusterConditions(clusterItems)
  const bindingTransitions = parseBindingTransitions(bindingItems)

  const events = correlateEvents(clusterTransitions, bindingTransitions)

  // Count active (Ready) clusters
  const readyClusters = new Set<string>()
  const allClusters = new Set<string>()
  for (const ct of clusterTransitions) {
    allClusters.add(ct.clusterName)
    if (ct.status === 'True') {
      readyClusters.add(ct.clusterName)
    }
  }
  // Also count clusters with no condition transitions
  for (const item of clusterItems) {
    allClusters.add(item.name)
  }

  const lastFailover = events.find(e => e.eventType === 'cluster_down')?.timestamp ?? null

  return {
    events,
    activeClusters: readyClusters.size,
    totalClusters: allClusters.size,
    lastFailover,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFailoverTimelineResult {
  data: FailoverTimelineData
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoFallback: boolean
}

export function useFailoverTimeline(): UseFailoverTimelineResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<FailoverTimelineData>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: FAILOVER_TIMELINE_DEMO_DATA,
    persist: true,
    fetcher: fetchFailoverTimeline,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = (data.events || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
    isDemoFallback: effectiveIsDemoData,
  }
}
