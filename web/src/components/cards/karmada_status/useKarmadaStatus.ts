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

/** Default count value when a field is missing or empty */
const DEFAULT_COUNT = 0

/** Arbitrary flag value representing an active/synced resource */
const SYNCED_RESOURCE_FLAG = 1

/** Expected number of parts when splitting pod readiness string (e.g. "1/1") */
const EXPECTED_READY_PARTS = 2

const INITIAL_DATA: KarmadaStatus = {
  health: 'not-installed',
  controllerPods: { ready: DEFAULT_COUNT, total: DEFAULT_COUNT },
  memberClusters: [],
  propagationPolicies: [],
  resourceBindings: [],
  clusterPoliciesCount: DEFAULT_COUNT,
  overridePoliciesCount: DEFAULT_COUNT,
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
  if (parts.length !== EXPECTED_READY_PARTS) return false
  return parts[0] === parts[1] && Number(parts[0]) > DEFAULT_COUNT;
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
  const statusObj = getRecord(raw)
  const conditions = getArray(statusObj.conditions)
  for (const c of conditions) {
    const rawCond = getRecord(c)
    if (rawCond.type === 'Ready' && rawCond.status === 'True') return 'Ready'
    if (rawCond.type === 'Ready' && rawCond.status === 'False') return 'NotReady'
  }
  return 'Unknown'
}

function parseMemberCluster(item: CRItem): KarmadaMemberCluster {
  const status = getRecord(item.status)
  const clusterStatus = parseClusterStatus(status)
  const nodeCount = typeof status.nodeCount === 'number' ? status.nodeCount : DEFAULT_COUNT
  const kubernetesVersion = typeof status.kubernetesVersion === 'string' ? status.kubernetesVersion : ''
  const syncedResources = item.labels?.['karmada.io/cluster-resource-version'] ? SYNCED_RESOURCE_FLAG : DEFAULT_COUNT

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
  const spec = getRecord(item.spec)
  const status = getRecord(item.status)

  // Parse resource selectors from spec
  const rawSelectors = getArray(spec.resourceSelectors)
  const resourceSelectors = rawSelectors.map((s: unknown) => {
    const sel = getRecord(s)
    const kind = typeof sel.kind === 'string' ? sel.kind : ''
    const name = typeof sel.name === 'string' ? sel.name : '*'
    return `${kind}:${name}`
  })

  // Parse target clusters from placement
  const placement = getRecord(spec.placement)
  const rawClusters = getArray(placement.clusterNames)
  const targetClusters = rawClusters.map(c => String(c))

  // Status-derived counts
  const aggregatedStatus = getArray(status.aggregatedStatus)
  let readyCount = DEFAULT_COUNT
  for (const s of aggregatedStatus) {
    const statusEntry = getRecord(s)
    if (statusEntry.applied === true) {
      readyCount += 1
    }
  }
  const bindingCount = aggregatedStatus.length

  return {
    name: item.name,
    namespace: item.namespace ?? '',
    bindingCount,
    readyCount,
    resourceSelectors,
    targetClusters,
  }
}

function parseBindingStatus(raw: unknown): KarmadaBindingStatus {
  const known: KarmadaBindingStatus[] = ['Scheduled', 'FullySchedulable', 'Binding', 'Bound', 'Failed']
  const str = String(raw ?? '')
  return known.includes(str as KarmadaBindingStatus) ? (str as KarmadaBindingStatus) : 'Unknown'
}

function parseResourceBinding(item: CRItem): KarmadaResourceBinding {
  const spec = getRecord(item.spec)
  const status = getRecord(item.status)
  
  const resourceDef = getRecord(spec.resource)
  const resourceKind = typeof resourceDef.kind === 'string' ? resourceDef.kind : ''

  const conditions = getArray(status.conditions)
  let bindingStatus: KarmadaBindingStatus = 'Unknown'
  
  for (const c of conditions) {
    const rawCond = getRecord(c)
    if (rawCond.type === 'Scheduled') {
      bindingStatus = rawCond.status === 'True' ? 'Scheduled' : 'Failed'
    }
    if (rawCond.type === 'FullySchedulable' && rawCond.status === 'True') {
      bindingStatus = 'FullySchedulable'
    }
    if (rawCond.type === 'Applied' && rawCond.status === 'True') {
      bindingStatus = 'Bound'
    }
  }
  
  const specClusters = getArray(spec.clusters)
  if (conditions.length === 0 && specClusters.length > 0) {
    bindingStatus = parseBindingStatus('Binding')
  }

  const boundClusters = specClusters.map(c => {
    const clusterObj = getRecord(c)
    return typeof clusterObj.name === 'string' ? clusterObj.name : ''
  })

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
    : (await fetchPods('/api/mcp/pods?namespace=karmada-system')).filter(isKarmadaControllerPod)

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

  // Treat "not-installed" as valid data so the card can render its own hint message.
  const hasAnyData = true;

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  });

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
