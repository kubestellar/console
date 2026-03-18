import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  KARMADA_DEMO_DATA,
  type KarmadaDemoData,
  type KarmadaMemberCluster,
  type KarmadaClusterStatus,
  type KarmadaPropagationPolicy,
  type KarmadaResourceBinding,
  type KarmadaBindingStatus,
} from './demoData'

export type KarmadaStatus = KarmadaDemoData

const INITIAL_DATA: KarmadaStatus = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  memberClusters: [],
  propagationPolicies: [],
  resourceBindings: [],
  clusterPoliciesCount: 0,
  overridePoliciesCount: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'karmada-status'

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

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
// Pod helpers — Karmada controller manager detection
// ---------------------------------------------------------------------------

function isKarmadaControllerPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'karmada-controller-manager' ||
    labels['app.kubernetes.io/name'] === 'karmada' ||
    name.startsWith('karmada-controller-manager') ||
    name.startsWith('karmada-scheduler') ||
    name.startsWith('karmada-agent')
  )
}

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  if (status !== 'running') return false
  const ready = pod.ready ?? ''
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

// ---------------------------------------------------------------------------
// CRD helpers
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
// CRD parsers
// ---------------------------------------------------------------------------

function parseClusterStatus(raw: unknown): KarmadaClusterStatus {
  const conditions = Array.isArray((raw as Record<string, unknown>)?.conditions)
    ? ((raw as Record<string, unknown>).conditions as Array<Record<string, unknown>>)
    : []
  for (const c of conditions) {
    if (c.type === 'Ready' && c.status === 'True') return 'Ready'
    if (c.type === 'Ready' && c.status === 'False') return 'NotReady'
  }
  return 'Unknown'
}

function parseMemberCluster(item: CRItem): KarmadaMemberCluster {
  const status = (item.status ?? {}) as Record<string, unknown>
  const clusterStatus = parseClusterStatus(status)
  const nodeCount = typeof status.nodeCount === 'number' ? status.nodeCount : 0
  const kubernetesVersion = (status.kubernetesVersion as string) ?? ''
  const syncedResources = (item.labels?.['karmada.io/cluster-resource-version'] ? 1 : 0)

  return {
    name: item.name,
    status: clusterStatus,
    kubernetesVersion,
    nodeCount,
    labels: item.labels ?? {},
    syncedResources,
  }
}

function parsePropagationPolicy(item: CRItem): KarmadaPropagationPolicy {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  // Parse resource selectors from spec
  const rawSelectors = Array.isArray(spec.resourceSelectors) ? spec.resourceSelectors : []
  const resourceSelectors = rawSelectors.map((s: unknown) => {
    const sel = s as Record<string, string>
    return `${sel.kind ?? ''}:${sel.name ?? '*'}`
  })

  // Parse target clusters from placement
  const placement = (spec.placement ?? {}) as Record<string, unknown>
  const rawClusters = Array.isArray(placement.clusterNames) ? (placement.clusterNames as string[]) : []

  // Status-derived counts
  const aggregatedStatus = (status.aggregatedStatus as Array<Record<string, unknown>>) ?? []
  const readyCount = aggregatedStatus.filter(s => s.applied === true).length
  const bindingCount = aggregatedStatus.length

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    bindingCount,
    readyCount,
    resourceSelectors,
    targetClusters: rawClusters,
  }
}

function parseBindingStatus(raw: unknown): KarmadaBindingStatus {
  const known: KarmadaBindingStatus[] = ['Scheduled', 'Fullyscheduable', 'MismatchedSchedulerError', 'Binding', 'Bound', 'Failed']
  const str = String(raw ?? '')
  return known.includes(str as KarmadaBindingStatus) ? (str as KarmadaBindingStatus) : 'Unknown'
}

function parseResourceBinding(item: CRItem): KarmadaResourceBinding {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  const resourceKind = (spec.resource as Record<string, string>)?.kind ?? ''

  const conditions = Array.isArray(status.conditions) ? status.conditions as Array<Record<string, unknown>> : []
  let bindingStatus: KarmadaBindingStatus = 'Unknown'
  for (const c of conditions) {
    if (c.type === 'Scheduled') {
      bindingStatus = c.status === 'True' ? 'Scheduled' : 'MismatchedSchedulerError'
    }
    if (c.type === 'Fullyscheduable' && c.status === 'True') {
      bindingStatus = 'Fullyscheduable'
    }
    if (c.type === 'Applied' && c.status === 'True') {
      bindingStatus = 'Bound'
    }
  }
  if (conditions.length === 0 && spec.clusters) {
    bindingStatus = parseBindingStatus('Binding')
  }

  const rawClusters = Array.isArray(spec.clusters) ? spec.clusters as Array<Record<string, string>> : []
  const boundClusters = rawClusters.map(c => c.name ?? '')

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    resourceKind,
    status: bindingStatus,
    boundClusters,
  }
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const body: { pods?: BackendPodInfo[] } = await resp.json()
    return Array.isArray(body?.pods) ? body.pods : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchKarmadaStatus(): Promise<KarmadaStatus> {
  // Step 1: Detect Karmada controller pods via label selector, fallback to all pods
  const labeledPods = await fetchPods(
    '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dkarmada',
  )
  const karmadaPods = labeledPods.length > 0
    ? labeledPods.filter(isKarmadaControllerPod)
    : (await fetchPods('/api/mcp/pods')).filter(isKarmadaControllerPod)

  if (karmadaPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = karmadaPods.filter(isPodReady).length
  const allReady = readyPods === karmadaPods.length

  // Step 2: Fetch Karmada CRDs in parallel (best-effort)
  const [clusterItems, propagationItems, bindingItems, clusterPolicyItems, overrideItems] = await Promise.all([
    fetchCR('cluster.karmada.io', 'v1alpha1', 'clusters'),
    fetchCR('policy.karmada.io', 'v1alpha1', 'propagationpolicies'),
    fetchCR('work.karmada.io', 'v1alpha2', 'resourcebindings'),
    fetchCR('policy.karmada.io', 'v1alpha1', 'clusterpropagationpolicies'),
    fetchCR('policy.karmada.io', 'v1alpha1', 'overridepolicies'),
  ])

  const memberClusters = clusterItems.map(parseMemberCluster)
  const propagationPolicies = propagationItems.map(parsePropagationPolicy)
  const resourceBindings = bindingItems.map(parseResourceBinding)

  const readyClusters = memberClusters.filter(c => c.status === 'Ready').length
  const degraded = !allReady || readyClusters < memberClusters.length

  return {
    health: degraded ? 'degraded' : 'healthy',
    controllerPods: { ready: readyPods, total: karmadaPods.length },
    memberClusters,
    propagationPolicies,
    resourceBindings,
    clusterPoliciesCount: clusterPolicyItems.length,
    overridePoliciesCount: overrideItems.length,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseKarmadaStatusResult {
  data: KarmadaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoFallback: boolean
}

export function useKarmadaStatus(): UseKarmadaStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<KarmadaStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KARMADA_DEMO_DATA,
    persist: true,
    fetcher: fetchKarmadaStatus,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.health !== 'not-installed'
    ? true
    : (data.memberClusters || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
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
