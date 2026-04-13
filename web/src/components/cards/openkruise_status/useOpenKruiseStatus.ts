/**
 * OpenKruise live-data hook
 *
 * Queries the OpenKruise CRDs (CloneSet, Advanced StatefulSet, Advanced
 * DaemonSet, SidecarSet, BroadcastJob, AdvancedCronJob) across connected
 * clusters through the `/api/mcp/custom-resources` endpoint and maps the
 * results into the OpenKruiseDemoData shape consumed by the card.
 *
 * Falls back to OPENKRUISE_DEMO_DATA via useCache's built-in demo fallback
 * when the fetcher fails or returns nothing.
 */

import { useCache } from '../../../lib/cache'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  OPENKRUISE_DEMO_DATA,
  type OpenKruiseDemoData,
  type OpenKruiseDemoCloneSet,
  type OpenKruiseDemoAdvancedStatefulSet,
  type OpenKruiseDemoAdvancedDaemonSet,
  type OpenKruiseDemoSidecarSet,
  type OpenKruiseDemoBroadcastJob,
  type OpenKruiseDemoAdvancedCronJob,
} from './demoData'

const CACHE_KEY = 'openkruise-status'

const OPENKRUISE_GROUP = 'apps.kruise.io'
const V1ALPHA1 = 'v1alpha1'
const V1BETA1 = 'v1beta1'

export const EMPTY_OPENKRUISE_DATA: OpenKruiseDemoData = {
  cloneSets: [],
  advancedStatefulSets: [],
  advancedDaemonSets: [],
  sidecarSets: [],
  broadcastJobs: [],
  advancedCronJobs: [],
  controllerVersion: '',
  totalInjectedPods: 0,
  lastCheckTime: new Date(0).toISOString(),
}

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  labels?: Record<string, string>
}

interface CRResponse {
  items?: CRItem[]
}

async function fetchCR(
  group: string,
  version: string,
  resource: string,
): Promise<CRItem[]> {
  try {
    const params = new URLSearchParams({ group, version, resource })
    const resp = await authFetch(`/api/mcp/custom-resources?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: CRResponse = await resp.json()
    return Array.isArray(body.items) ? body.items : []
  } catch {
    return []
  }
}

// --------------------------------------------------------------------
// Small helpers over the loosely-typed spec/status blobs
// --------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function firstContainerImage(spec: Record<string, unknown>): string {
  const template = asRecord(spec.template)
  const podSpec = asRecord(template.spec)
  const containers = Array.isArray(podSpec.containers) ? podSpec.containers : []
  const first = containers[0] as Record<string, unknown> | undefined
  return asString(first?.image)
}

function classifyReadyStatus(
  ready: number,
  desired: number,
): 'healthy' | 'updating' | 'failed' {
  if (desired > 0 && ready === desired) return 'healthy'
  if (desired > 0 && ready === 0) return 'failed'
  return 'updating'
}

// --------------------------------------------------------------------
// Per-resource mappers — deliberately forgiving: missing fields default
// to sensible zeros so a partial cluster response never throws.
// --------------------------------------------------------------------

function mapCloneSet(item: CRItem): OpenKruiseDemoCloneSet {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const updateStrategy = asRecord(spec.updateStrategy)
  const replicas = asNumber(spec.replicas)
  const readyReplicas = asNumber(status.readyReplicas)
  const updatedReplicas = asNumber(status.updatedReplicas)
  const strategyType = asString(updateStrategy.type, 'InPlaceIfPossible')
  return {
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    replicas,
    readyReplicas,
    updatedReplicas,
    updatedReadyReplicas: asNumber(
      status.updatedReadyReplicas,
      Math.min(readyReplicas, updatedReplicas),
    ),
    updateStrategy: (strategyType === 'ReCreate' ||
    strategyType === 'InPlaceOnly' ||
    strategyType === 'InPlaceIfPossible'
      ? strategyType
      : 'InPlaceIfPossible') as OpenKruiseDemoCloneSet['updateStrategy'],
    partition: asNumber(updateStrategy.partition),
    status: classifyReadyStatus(readyReplicas, replicas),
    image: firstContainerImage(spec),
    updatedAt: new Date().toISOString(),
  }
}

function mapAdvancedStatefulSet(
  item: CRItem,
): OpenKruiseDemoAdvancedStatefulSet {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const updateStrategy = asRecord(spec.updateStrategy)
  const replicas = asNumber(spec.replicas)
  const readyReplicas = asNumber(status.readyReplicas)
  const pmp = asString(spec.podManagementPolicy, 'OrderedReady')
  const strategyType = asString(updateStrategy.type, 'RollingUpdate')
  return {
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    replicas,
    readyReplicas,
    updatedReplicas: asNumber(status.updatedReplicas),
    podManagementPolicy: (pmp === 'Parallel'
      ? 'Parallel'
      : 'OrderedReady') as OpenKruiseDemoAdvancedStatefulSet['podManagementPolicy'],
    updateStrategy: (strategyType === 'InPlaceIfPossible' ||
    strategyType === 'InPlaceOnly' ||
    strategyType === 'RollingUpdate'
      ? strategyType
      : 'RollingUpdate') as OpenKruiseDemoAdvancedStatefulSet['updateStrategy'],
    status: classifyReadyStatus(readyReplicas, replicas),
    image: firstContainerImage(spec),
    updatedAt: new Date().toISOString(),
  }
}

function mapAdvancedDaemonSet(
  item: CRItem,
): OpenKruiseDemoAdvancedDaemonSet {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const updateStrategy = asRecord(spec.updateStrategy)
  const rollingUpdate = asRecord(updateStrategy.rollingUpdate)
  const desired = asNumber(status.desiredNumberScheduled)
  const ready = asNumber(status.numberReady)
  const rut = asString(rollingUpdate.type, 'Standard')
  return {
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    desiredScheduled: desired,
    currentScheduled: asNumber(status.currentNumberScheduled, desired),
    numberReady: ready,
    updatedScheduled: asNumber(status.updatedNumberScheduled),
    rollingUpdateType: (rut === 'Surging' || rut === 'InPlaceIfPossible'
      ? rut
      : 'Standard') as OpenKruiseDemoAdvancedDaemonSet['rollingUpdateType'],
    status: classifyReadyStatus(ready, desired),
    image: firstContainerImage(spec),
    updatedAt: new Date().toISOString(),
  }
}

function mapSidecarSet(item: CRItem): OpenKruiseDemoSidecarSet {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const selector = asRecord(spec.selector)
  const namespaceSelector = asRecord(spec.namespaceSelector)
  const matchLabels = asRecord(selector.matchLabels)
  const containers = Array.isArray(spec.containers) ? spec.containers : []
  const containerNames = containers
    .map(c => asString((c as Record<string, unknown>)?.name))
    .filter(n => n.length > 0)
  const matched = asNumber(status.matchedPods)
  const injected = asNumber(status.injectedPods)
  const ready = asNumber(status.readyPods)
  const updateStrategyRaw = asRecord(spec.updateStrategy)
  const strategyType = asString(updateStrategyRaw.type, 'RollingUpdate')
  return {
    name: item.name,
    cluster: item.cluster,
    selectorLabels: Object.fromEntries(
      Object.entries(matchLabels).map(([k, v]) => [k, String(v ?? '')]),
    ),
    namespaceSelector:
      Object.keys(namespaceSelector).length > 0
        ? JSON.stringify(namespaceSelector)
        : null,
    sidecarContainers: containerNames,
    matchedPods: matched,
    injectedPods: injected,
    updatedPods: asNumber(status.updatedPods),
    readyPods: ready,
    updateStrategy: (strategyType === 'NotUpdate'
      ? 'NotUpdate'
      : 'RollingUpdate') as OpenKruiseDemoSidecarSet['updateStrategy'],
    status: classifyReadyStatus(injected, matched),
    updatedAt: new Date().toISOString(),
  }
}

function mapBroadcastJob(item: CRItem): OpenKruiseDemoBroadcastJob {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const completionPolicy = asRecord(spec.completionPolicy)
  const desired = asNumber(status.desired)
  const succeeded = asNumber(status.succeeded)
  const failed = asNumber(status.failed)
  const active = asNumber(status.active)
  const cpt = asString(completionPolicy.type, 'Always')
  let bjStatus: OpenKruiseDemoBroadcastJob['status'] = 'running'
  if (failed > 0 && active === 0) bjStatus = 'failed'
  else if (desired > 0 && succeeded === desired) bjStatus = 'succeeded'
  else if (active === 0 && desired === 0) bjStatus = 'pending'
  return {
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    desired,
    active,
    succeeded,
    failed,
    completionPolicyType: (cpt === 'Never'
      ? 'Never'
      : 'Always') as OpenKruiseDemoBroadcastJob['completionPolicyType'],
    status: bjStatus,
    startedAt: asString(status.startTime, new Date().toISOString()),
    completedAt: asString(status.completionTime) || null,
  }
}

function mapAdvancedCronJob(item: CRItem): OpenKruiseDemoAdvancedCronJob {
  const spec = asRecord(item.spec)
  const status = asRecord(item.status)
  const template = asRecord(spec.template)
  const templateKind: OpenKruiseDemoAdvancedCronJob['templateKind'] =
    template.broadcastJobTemplate
      ? 'BroadcastJob'
      : template.jobTemplate
        ? 'Job'
        : 'BroadcastJob'
  const activeArr = Array.isArray(status.active) ? status.active : []
  const paused = Boolean(spec.paused)
  return {
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    schedule: asString(spec.schedule, '* * * * *'),
    templateKind,
    active: activeArr.length,
    lastScheduleTime: asString(status.lastScheduleTime) || null,
    status: paused ? 'suspended' : 'active',
    successfulRuns: 0,
    failedRuns: 0,
  }
}

// --------------------------------------------------------------------
// Top-level fetcher
// --------------------------------------------------------------------

async function fetchOpenKruiseStatus(): Promise<OpenKruiseDemoData> {
  const [cs, ss, ds, sc, bj, cj] = await Promise.all([
    fetchCR(OPENKRUISE_GROUP, V1ALPHA1, 'clonesets'),
    fetchCR(OPENKRUISE_GROUP, V1BETA1, 'statefulsets'),
    fetchCR(OPENKRUISE_GROUP, V1ALPHA1, 'daemonsets'),
    fetchCR(OPENKRUISE_GROUP, V1ALPHA1, 'sidecarsets'),
    fetchCR(OPENKRUISE_GROUP, V1ALPHA1, 'broadcastjobs'),
    fetchCR(OPENKRUISE_GROUP, V1ALPHA1, 'advancedcronjobs'),
  ])

  const sidecarSets = sc.map(mapSidecarSet)
  const totalInjectedPods = sidecarSets.reduce((sum, s) => sum + s.injectedPods, 0)

  return {
    cloneSets: cs.map(mapCloneSet),
    advancedStatefulSets: ss.map(mapAdvancedStatefulSet),
    advancedDaemonSets: ds.map(mapAdvancedDaemonSet),
    sidecarSets,
    broadcastJobs: bj.map(mapBroadcastJob),
    advancedCronJobs: cj.map(mapAdvancedCronJob),
    controllerVersion: '',
    totalInjectedPods,
    lastCheckTime: new Date().toISOString(),
  }
}

// --------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------

export interface UseOpenKruiseStatusResult {
  data: OpenKruiseDemoData
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useOpenKruiseStatus(): UseOpenKruiseStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCache<OpenKruiseDemoData>({
    key: CACHE_KEY,
    fetcher: fetchOpenKruiseStatus,
    demoData: OPENKRUISE_DEMO_DATA,
    initialData: EMPTY_OPENKRUISE_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  }
}
