/**
 * Hook for fetching and caching KubeFlex status data.
 *
 * Uses the unified cache layer with the 'operators' refresh category (300s).
 * Detection is based on pods with `app.kubernetes.io/name=kubeflex` or
 * `app=kubeflex-controller`. Control planes are detected via the
 * `kubeflex.io/control-plane` label.
 */

import { useCache } from '../../../../lib/cache'
import { useCardLoadingState } from '../../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'
import { KUBEFLEX_CACHE_KEY, OPERATOR_REFRESH_CATEGORY } from '../shared'
import type { ComponentHealth } from '../shared'
import type { ControlPlaneInfo } from './helpers'
import {
  isKubeFlexControllerPod,
  isKubeFlexControlPlanePod,
  isPodHealthy,
  groupControlPlanes,
  countTenants,
} from './helpers'
import { KUBEFLEX_DEMO_DATA, type KubeFlexStatusDemoData } from './demoData'

// ============================================================================
// Data Interface
// ============================================================================

export interface KubeFlexStatus {
  detected: boolean
  health: ComponentHealth
  controllerHealthy: boolean
  controlPlanes: ControlPlaneInfo[]
  tenantCount: number
  lastCheckTime: string
}

// ============================================================================
// Initial Data
// ============================================================================

const INITIAL_DATA: KubeFlexStatus = {
  detected: false,
  health: 'not-installed',
  controllerHealthy: false,
  controlPlanes: [],
  tenantCount: 0,
  lastCheckTime: new Date().toISOString(),
}

// ============================================================================
// Backend response shapes
// ============================================================================

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  containers?: Array<{
    image?: string
    state?: 'running' | 'waiting' | 'terminated'
    reason?: string
  }>
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetchKubeFlexStatus(): Promise<KubeFlexStatus> {
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

  // Identify KubeFlex controller pods
  const controllerPods = allPods.filter((pod) => isKubeFlexControllerPod(pod.labels))

  // Identify control-plane pods
  const cpPods = allPods.filter((pod) => isKubeFlexControlPlanePod(pod.labels))

  if (controllerPods.length === 0 && cpPods.length === 0) {
    return {
      ...INITIAL_DATA,
      detected: false,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const controllerHealthy = controllerPods.length > 0 && controllerPods.every(isPodHealthy)
  const controlPlanes = groupControlPlanes(cpPods)
  const tenantCount = countTenants(cpPods)

  // Determine overall health
  const unhealthyCPs = controlPlanes.filter((cp) => !cp.healthy).length
  let health: ComponentHealth = 'healthy'
  if (!controllerHealthy || unhealthyCPs > 0) {
    health = 'degraded'
  }

  return {
    detected: true,
    health,
    controllerHealthy,
    controlPlanes,
    tenantCount,
    lastCheckTime: new Date().toISOString(),
  }
}

// ============================================================================
// Demo data converter
// ============================================================================

function toDemoStatus(demo: KubeFlexStatusDemoData): KubeFlexStatus {
  return {
    detected: demo.detected,
    health: demo.health,
    controllerHealthy: demo.controllerHealthy,
    controlPlanes: demo.controlPlanes,
    tenantCount: demo.tenantCount,
    lastCheckTime: demo.lastCheckTime,
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseKubeFlexStatusResult {
  data: KubeFlexStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useKubeFlexStatus(): UseKubeFlexStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<KubeFlexStatus>({
      key: KUBEFLEX_CACHE_KEY,
      category: OPERATOR_REFRESH_CATEGORY,
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(KUBEFLEX_DEMO_DATA),
      persist: true,
      fetcher: fetchKubeFlexStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.detected

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
