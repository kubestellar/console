/**
 * Data-fetching hook for the KubeRay Fleet Monitor card.
 *
 * Discovers RayCluster, RayService, and RayJob CRDs across all connected
 * clusters using the existing /api/mcp/custom-resources endpoint.
 */

import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  KUBERAY_FLEET_DEMO_DATA,
  type KubeRayFleetData,
  type RayClusterInfo,
  type RayClusterState,
  type RayServiceInfo,
  type RayServiceStatus,
  type RayJobInfo,
  type RayJobStatus,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kuberay-fleet-status'
const RAY_API_GROUP = 'ray.io'
const RAY_API_VERSION = 'v1'

const INITIAL_DATA: KubeRayFleetData = {
  detected: false,
  rayClusters: [],
  rayServices: [],
  rayJobs: [],
  totalGPUs: 0,
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
// CRD fetch helper (same pattern as karmada_status)
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
// Safe accessors
// ---------------------------------------------------------------------------

function getRecord(val: unknown): Record<string, unknown> {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  return {}
}

function safeNumber(val: unknown, fallback = 0): number {
  return typeof val === 'number' ? val : fallback
}

function safeString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback
}

// ---------------------------------------------------------------------------
// CRD parsers
// ---------------------------------------------------------------------------

function parseRayCluster(item: CRItem): RayClusterInfo {
  const status = getRecord(item.status)
  const spec = getRecord(item.spec)
  const workerSpecs = Array.isArray(spec.workerGroupSpecs) ? spec.workerGroupSpecs : []

  let gpuCount = 0
  for (const wg of workerSpecs) {
    const wgObj = getRecord(wg)
    const replicas = safeNumber(wgObj.replicas, 1)
    const template = getRecord(getRecord(wgObj.template).spec)
    const containers = Array.isArray(template.containers) ? template.containers : []
    for (const c of containers) {
      const limits = getRecord(getRecord(getRecord(c).resources).limits)
      const gpuVal = limits['nvidia.com/gpu']
      if (gpuVal) gpuCount += safeNumber(gpuVal) * replicas
    }
  }

  const stateStr = safeString(status.state).toLowerCase()
  let state: RayClusterState = 'unknown'
  if (stateStr === 'ready') state = 'ready'
  else if (stateStr === 'unhealthy' || stateStr === 'failed') state = 'unhealthy'
  else if (stateStr === 'suspended') state = 'suspended'

  const head = getRecord(status.head)

  return {
    name: item.name,
    namespace: item.namespace ?? 'default',
    cluster: item.cluster,
    state,
    desiredWorkers: safeNumber(status.desiredWorkerReplicas),
    availableWorkers: safeNumber(status.availableWorkerReplicas),
    headPodIP: safeString(head.podIP),
    gpuCount,
  }
}

function parseRayService(item: CRItem): RayServiceInfo {
  const status = getRecord(item.status)
  const activeStatus = getRecord(status.activeServiceStatus)
  const pendingStatus = getRecord(status.pendingServiceStatus)
  const rayClusterStatus = getRecord(activeStatus.rayClusterStatus)

  const statusStr = safeString(status.serviceStatus) as RayServiceStatus
  const validStatuses: RayServiceStatus[] = ['Running', 'Deploying', 'FailedToGetOrCreateRayCluster', 'WaitForServeDeploymentReady']

  return {
    name: item.name,
    namespace: item.namespace ?? 'default',
    cluster: item.cluster,
    status: validStatuses.includes(statusStr) ? statusStr : 'Unknown',
    activeClusterName: safeString(rayClusterStatus.rayClusterName),
    pendingUpgrade: Object.keys(pendingStatus).length > 0,
  }
}

function parseRayJob(item: CRItem): RayJobInfo {
  const status = getRecord(item.status)
  const jobStatusStr = safeString(status.jobStatus) as RayJobStatus
  const validStatuses: RayJobStatus[] = ['RUNNING', 'SUCCEEDED', 'FAILED', 'PENDING', 'STOPPED']

  return {
    name: item.name,
    namespace: item.namespace ?? 'default',
    cluster: item.cluster,
    jobStatus: validStatuses.includes(jobStatusStr) ? jobStatusStr : 'PENDING',
    submissionId: safeString(status.jobId),
  }
}

// ---------------------------------------------------------------------------
// Live data fetcher
// ---------------------------------------------------------------------------

async function fetchKubeRayFleet(): Promise<KubeRayFleetData> {
  const [clusters, services, jobs] = await Promise.all([
    fetchCR(RAY_API_GROUP, RAY_API_VERSION, 'rayclusters'),
    fetchCR(RAY_API_GROUP, RAY_API_VERSION, 'rayservices'),
    fetchCR(RAY_API_GROUP, RAY_API_VERSION, 'rayjobs'),
  ])

  const detected = clusters.length > 0 || services.length > 0 || jobs.length > 0
  if (!detected) throw new Error('No Ray resources detected')

  const rayClusters = clusters.map(parseRayCluster)
  const rayServices = services.map(parseRayService)
  const rayJobs = jobs.map(parseRayJob)
  const totalGPUs = rayClusters.reduce((sum, c) => sum + c.gpuCount, 0)

  return {
    detected: true,
    rayClusters,
    rayServices,
    rayJobs,
    totalGPUs,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKubeRayFleet() {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
  } = useCache<KubeRayFleetData>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: KUBERAY_FLEET_DEMO_DATA,
    persist: true,
    fetcher: fetchKubeRayFleet,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = data.detected
    ? ((data.rayClusters || []).length > 0 || (data.rayServices || []).length > 0 || (data.rayJobs || []).length > 0)
    : !isFailed // "not detected" is a valid state

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
    showSkeleton,
    showEmptyState,
    error: isFailed && !hasAnyData,
  }
}
