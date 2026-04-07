/**
 * Hook for fetching and caching KubeVirt status data.
 *
 * Uses the unified cache layer with the 'operators' refresh category (300s).
 * Detection is based on pods in the kubevirt namespace with labels matching
 * virt-operator, virt-controller, virt-api, or virt-handler. VMs are detected
 * via virt-launcher pods.
 */

import { useCache } from '../../../../lib/cache'
import { useCardLoadingState } from '../../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'
import { KUBEVIRT_CACHE_KEY, OPERATOR_REFRESH_CATEGORY } from '../shared'
import type { ComponentHealth } from '../shared'
import {
  isKubevirtPod,
  isVirtLauncher,
  isPodHealthy,
  getVmStatus,
  countVmTenants,
} from './helpers'
import type { KubevirtPodInfo } from './helpers'
import { KUBEVIRT_DEMO_DATA, type VmInfo, type ClusterKubevirtInfo, type KubevirtStatusDemoData } from './demoData'

// ============================================================================
// Data Interface
// ============================================================================

export interface KubevirtStatus {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  vms: VmInfo[]
  tenantCount: number
  lastCheckTime: string
  /** Per-cluster KubeVirt breakdown */
  clusters: ClusterKubevirtInfo[]
}

// ============================================================================
// Initial Data
// ============================================================================

const INITIAL_DATA: KubevirtStatus = {
  detected: false,
  health: 'not-installed',
  podCount: 0,
  healthyPods: 0,
  unhealthyPods: 0,
  vms: [],
  tenantCount: 0,
  lastCheckTime: new Date().toISOString(),
  clusters: [],
}

// ============================================================================
// Backend response shapes (only fields we use)
// ============================================================================

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  /** Cluster context this pod belongs to */
  cluster?: string
  /** Resource requests/limits (used to extract CPU/memory for VMs) */
  resources?: {
    requests?: Record<string, string>
    limits?: Record<string, string>
  }
  /** Pod creation timestamp */
  creationTimestamp?: string
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetchKubevirtStatus(): Promise<KubevirtStatus> {
  const podsResp = await fetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!podsResp.ok) {
    if (podsResp.status === 401 || podsResp.status === 403) {
      return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
    }
    throw new Error(`HTTP ${podsResp.status}`)
  }

  const podsBody: { pods?: BackendPodInfo[] } = await podsResp.json()
  const allPods = Array.isArray(podsBody?.pods) ? podsBody.pods : []

  // Identify KubeVirt infrastructure pods
  const kubevirtPods = allPods.filter((pod) =>
    isKubevirtPod(pod.labels, pod.namespace),
  )

  if (kubevirtPods.length === 0) {
    return {
      ...INITIAL_DATA,
      lastCheckTime: new Date().toISOString(),
    }
  }

  let healthy = 0
  let unhealthy = 0
  for (const pod of kubevirtPods) {
    const podInfo: KubevirtPodInfo = {
      status: pod.status,
      ready: pod.ready,
    }
    if (isPodHealthy(podInfo)) {
      healthy += 1
    } else {
      unhealthy += 1
    }
  }

  // Detect VM launcher pods
  const vmPods = allPods.filter((pod) => isVirtLauncher(pod.labels))

  const vms: VmInfo[] = (vmPods || []).map((pod) => {
    const podInfo: KubevirtPodInfo = {
      name: pod.name,
      namespace: pod.namespace,
      status: pod.status,
      ready: pod.ready,
      labels: pod.labels,
    }
    return {
      name: pod.name ?? 'unknown',
      namespace: pod.namespace ?? 'unknown',
      state: getVmStatus(podInfo),
      cluster: pod.cluster ?? 'unknown',
      cpu: pod.resources?.requests?.cpu || pod.resources?.limits?.cpu,
      memory: pod.resources?.requests?.memory || pod.resources?.limits?.memory,
      creationTime: pod.creationTimestamp,
    }
  })

  const vmPodInfos: KubevirtPodInfo[] = vmPods.map((pod) => ({
    name: pod.name,
    namespace: pod.namespace,
    status: pod.status,
    ready: pod.ready,
    labels: pod.labels,
  }))

  const tenantCount = countVmTenants(vmPodInfos)

  const health: ComponentHealth = unhealthy > 0 ? 'degraded' : 'healthy'

  // Build per-cluster breakdown
  const clusterMap = new Map<string, ClusterKubevirtInfo>()
  for (const pod of kubevirtPods) {
    const clusterName = pod.cluster ?? 'unknown'
    if (!clusterMap.has(clusterName)) {
      clusterMap.set(clusterName, {
        cluster: clusterName,
        installed: true,
        vmCount: 0,
        runningCount: 0,
        infraPods: 0,
        health: 'healthy',
      })
    }
    const entry = clusterMap.get(clusterName)!
    entry.infraPods += 1
    const podInfo: KubevirtPodInfo = { status: pod.status, ready: pod.ready }
    if (!isPodHealthy(podInfo)) {
      entry.health = 'degraded'
    }
  }
  for (const vm of vms) {
    const entry = clusterMap.get(vm.cluster)
    if (entry) {
      entry.vmCount += 1
      if (vm.state === 'running') {
        entry.runningCount += 1
      }
    }
  }
  const clusters = Array.from(clusterMap.values())

  return {
    detected: true,
    health,
    podCount: kubevirtPods.length,
    healthyPods: healthy,
    unhealthyPods: unhealthy,
    vms,
    tenantCount,
    lastCheckTime: new Date().toISOString(),
    clusters,
  }
}

// ============================================================================
// Demo data converter
// ============================================================================

function toDemoStatus(demo: KubevirtStatusDemoData): KubevirtStatus {
  return {
    detected: demo.detected,
    health: demo.health,
    podCount: demo.podCount,
    healthyPods: demo.healthyPods,
    unhealthyPods: demo.unhealthyPods,
    vms: demo.vms,
    tenantCount: demo.tenantCount,
    lastCheckTime: demo.lastCheckTime,
    clusters: demo.clusters || [],
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseKubevirtStatusResult {
  data: KubevirtStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoData: boolean
}

export function useKubevirtStatus(): UseKubevirtStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<KubevirtStatus>({
      key: KUBEVIRT_CACHE_KEY,
      category: OPERATOR_REFRESH_CATEGORY,
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(KUBEVIRT_DEMO_DATA),
      persist: true,
      fetcher: fetchKubevirtStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.detected

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
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
    isDemoData: effectiveIsDemoData,
  }
}
