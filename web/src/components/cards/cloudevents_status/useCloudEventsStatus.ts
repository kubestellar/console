import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { CLOUDEVENTS_DEMO_DATA, type CloudEventResource, type CloudEventsDemoData } from './demoData'

export type CloudEventsStatus = CloudEventsDemoData

const CACHE_KEY = 'cloudevents-status'
const EVENTING_GROUP = 'eventing.knative.dev'
const EVENTING_VERSION = 'v1'
const SOURCES_GROUP = 'sources.knative.dev'
const SOURCES_VERSION = 'v1'
const SOURCE_RESOURCES = ['pingsources', 'apiserversources', 'containersources']
const READY_CONDITION = 'Ready'

const INITIAL_DATA: CloudEventsStatus = {
  health: 'not-installed',
  brokers: { total: 0, ready: 0, notReady: 0 },
  triggers: { total: 0, ready: 0, notReady: 0 },
  eventSources: { total: 0, ready: 0, failed: 0 },
  deliveries: { successful: 0, failed: 0, unknown: 0 },
  resources: [],
  lastCheckTime: new Date().toISOString(),
}

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
}

interface CRResponse {
  items?: CRItem[]
}

interface ResourceCounts {
  total: number
  ready: number
  notReady: number
}

function getConditionValue(item: CRItem, conditionType: string): string | undefined {
  const conditions = Array.isArray(item.status?.conditions) ? item.status?.conditions : []
  for (const condition of conditions) {
    const conditionMap = condition as Record<string, unknown>
    const currentType = typeof conditionMap.type === 'string' ? conditionMap.type : ''
    if (currentType !== conditionType) {
      continue
    }
    return typeof conditionMap.status === 'string' ? conditionMap.status : undefined
  }
  return undefined
}

function getConditionTimestamp(item: CRItem, conditionType: string): string | undefined {
  const conditions = Array.isArray(item.status?.conditions) ? item.status?.conditions : []
  for (const condition of conditions) {
    const conditionMap = condition as Record<string, unknown>
    const currentType = typeof conditionMap.type === 'string' ? conditionMap.type : ''
    if (currentType !== conditionType) {
      continue
    }
    return typeof conditionMap.lastTransitionTime === 'string' ? conditionMap.lastTransitionTime : undefined
  }
  return undefined
}

function getStateFromReadyCondition(item: CRItem): CloudEventResource['state'] {
  const readyStatus = getConditionValue(item, READY_CONDITION)
  if (readyStatus === 'True') {
    return 'ready'
  }
  if (readyStatus === 'False') {
    return 'error'
  }
  return 'degraded'
}

function mapKindFromResource(resource: string): string {
  if (resource === 'brokers') return 'Broker'
  if (resource === 'triggers') return 'Trigger'
  if (resource === 'pingsources') return 'PingSource'
  if (resource === 'apiserversources') return 'ApiServerSource'
  if (resource === 'containersources') return 'ContainerSource'
  return resource
}

function parseSink(item: CRItem): string {
  const sink = (item.spec?.sink ?? {}) as Record<string, unknown>
  const ref = (sink.ref ?? {}) as Record<string, unknown>
  const name = typeof ref.name === 'string' ? ref.name : ''
  return name
}

function buildCounts(items: CRItem[]): ResourceCounts {
  const ready = items.filter((item) => getConditionValue(item, READY_CONDITION) === 'True').length
  return {
    total: items.length,
    ready,
    notReady: items.length - ready,
  }
}

export const __testables = {
  getConditionValue,
  getConditionTimestamp,
  getStateFromReadyCondition,
  mapKindFromResource,
  parseSink,
  buildCounts,
}

async function fetchCR(group: string, version: string, resource: string): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const response = await fetch(`/api/mcp/custom-resources?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      return []
    }

    const body: CRResponse = await response.json()
    return Array.isArray(body.items) ? body.items : []
  } catch {
    return []
  }
}

async function fetchCloudEventsStatus(): Promise<CloudEventsStatus> {
  const [brokers, triggers, ...sourceGroups] = await Promise.all([
    fetchCR(EVENTING_GROUP, EVENTING_VERSION, 'brokers'),
    fetchCR(EVENTING_GROUP, EVENTING_VERSION, 'triggers'),
    ...SOURCE_RESOURCES.map((resource) => fetchCR(SOURCES_GROUP, SOURCES_VERSION, resource)),
  ])

  const sourceGroupByResource = SOURCE_RESOURCES.map((resource, index) => ({
    resource,
    items: sourceGroups[index] ?? [],
  }))
  const sources = sourceGroupByResource.flatMap((group) => group.items)

  if (brokers.length === 0 && triggers.length === 0 && sources.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const brokerCounts = buildCounts(brokers)
  const triggerCounts = buildCounts(triggers)
  const sourceReady = sources.filter((source) => getConditionValue(source, READY_CONDITION) === 'True').length

  const sourceCounts = {
    total: sources.length,
    ready: sourceReady,
    failed: sources.length - sourceReady,
  }

  const delivery = triggers.reduce(
    (acc, trigger) => {
      const status = getConditionValue(trigger, READY_CONDITION)
      if (status === 'True') {
        acc.successful += 1
      } else if (status === 'False') {
        acc.failed += 1
      } else {
        acc.unknown += 1
      }
      return acc
    },
    { successful: 0, failed: 0, unknown: 0 },
  )

  const nowIso = new Date().toISOString()
  const resources: CloudEventResource[] = [
    ...brokers.map((item) => ({
      name: item.name,
      namespace: item.namespace ?? 'default',
      cluster: item.cluster,
      kind: 'Broker',
      state: getStateFromReadyCondition(item),
      sink: parseSink(item),
      lastSeen: getConditionTimestamp(item, READY_CONDITION) ?? nowIso,
    })),
    ...triggers.map((item) => ({
      name: item.name,
      namespace: item.namespace ?? 'default',
      cluster: item.cluster,
      kind: 'Trigger',
      state: getStateFromReadyCondition(item),
      sink: parseSink(item),
      lastSeen: getConditionTimestamp(item, READY_CONDITION) ?? nowIso,
    })),
    ...sourceGroupByResource.flatMap((group) =>
      group.items.map((item) => ({
        name: item.name,
        namespace: item.namespace ?? 'default',
        cluster: item.cluster,
        kind: mapKindFromResource(group.resource),
        state: getStateFromReadyCondition(item),
        sink: parseSink(item),
        lastSeen: getConditionTimestamp(item, READY_CONDITION) ?? nowIso,
      }))),
  ]

  const health: CloudEventsStatus['health'] =
    brokerCounts.notReady > 0 || triggerCounts.notReady > 0 || sourceCounts.failed > 0
      ? 'degraded'
      : 'healthy'

  return {
    health,
    brokers: brokerCounts,
    triggers: triggerCounts,
    eventSources: sourceCounts,
    deliveries: delivery,
    resources,
    lastCheckTime: nowIso,
  }
}

export interface UseCloudEventsStatusResult {
  data: CloudEventsStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useCloudEventsStatus(): UseCloudEventsStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<CloudEventsStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: CLOUDEVENTS_DEMO_DATA,
      persist: true,
      fetcher: fetchCloudEventsStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.health === 'not-installed'
    ? true
    : ((data.brokers.total + data.triggers.total + data.eventSources.total) > 0)

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
  }
}
