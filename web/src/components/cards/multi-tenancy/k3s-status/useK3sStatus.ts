/**
 * Hook for fetching and caching K3s status data.
 *
 * Uses the unified cache layer with the 'operators' refresh category (300s).
 * Detection is based on pods whose container images contain 'k3s' or whose
 * labels identify them as K3s server pods.
 */

import { useCache } from '../../../../lib/cache'
import { useCardLoadingState } from '../../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'
import { K3S_CACHE_KEY, OPERATOR_REFRESH_CATEGORY } from '../shared'
import type { ComponentHealth } from '../shared'
import { K3S_DEMO_DATA, type K3sServerPodInfo, type K3sStatusDemoData } from './demoData'

// ============================================================================
// Data Interface
// ============================================================================

export interface K3sStatus {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  serverPods: K3sServerPodInfo[]
  lastCheckTime: string
}

// ============================================================================
// Initial Data
// ============================================================================

const INITIAL_DATA: K3sStatus = {
  detected: false,
  health: 'not-installed',
  podCount: 0,
  healthyPods: 0,
  unhealthyPods: 0,
  serverPods: [],
  lastCheckTime: new Date().toISOString(),
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
  containers?: Array<{ image?: string }>
}

// ============================================================================
// Helpers
// ============================================================================

/** Image substring identifying a K3s container */
const K3S_IMAGE_MARKER = 'k3s'

function isK3sPod(pod: BackendPodInfo): boolean {
  // Check labels
  const appLabel = (pod.labels ?? {})['app'] ?? ''
  if (appLabel.includes('k3s')) return true

  // Check container images
  const containers = pod.containers ?? []
  return containers.some((c) => (c.image ?? '').includes(K3S_IMAGE_MARKER))
}

function isPodHealthy(status?: string, ready?: string): boolean {
  if ((status ?? '').toLowerCase() !== 'running') return false
  const parts = String(ready ?? '').split('/')
  const readyCount = Number.parseInt(parts[0] ?? '0', 10)
  const totalCount = Number.parseInt(parts[1] ?? '0', 10)
  return totalCount > 0 && readyCount === totalCount
}

function extractVersion(pod: BackendPodInfo): string {
  const containers = pod.containers ?? []
  for (const c of containers) {
    const img = c.image ?? ''
    // Extract tag from image like "rancher/k3s:v1.30.4+k3s1"
    const tagIndex = img.lastIndexOf(':')
    if (tagIndex > 0) {
      return img.substring(tagIndex + 1)
    }
  }
  return 'unknown'
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetchK3sStatus(): Promise<K3sStatus> {
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

  const k3sPods = allPods.filter(isK3sPod)

  if (k3sPods.length === 0) {
    return {
      ...INITIAL_DATA,
      lastCheckTime: new Date().toISOString(),
    }
  }

  let healthy = 0
  let unhealthy = 0
  const serverPods: K3sServerPodInfo[] = []

  for (const pod of k3sPods) {
    const isHealthy = isPodHealthy(pod.status, pod.ready)
    if (isHealthy) {
      healthy += 1
    } else {
      unhealthy += 1
    }
    serverPods.push({
      name: pod.name ?? 'unknown',
      namespace: pod.namespace ?? 'unknown',
      status: isHealthy ? 'running' : ((pod.status ?? '').toLowerCase() === 'pending' ? 'pending' : 'failed'),
      version: extractVersion(pod),
    })
  }

  const health: ComponentHealth = unhealthy > 0 ? 'degraded' : 'healthy'

  return {
    detected: true,
    health,
    podCount: k3sPods.length,
    healthyPods: healthy,
    unhealthyPods: unhealthy,
    serverPods,
    lastCheckTime: new Date().toISOString(),
  }
}

// ============================================================================
// Demo data converter
// ============================================================================

function toDemoStatus(demo: K3sStatusDemoData): K3sStatus {
  return {
    detected: demo.detected,
    health: demo.health,
    podCount: demo.podCount,
    healthyPods: demo.healthyPods,
    unhealthyPods: demo.unhealthyPods,
    serverPods: demo.serverPods,
    lastCheckTime: demo.lastCheckTime,
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseK3sStatusResult {
  data: K3sStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useK3sStatus(): UseK3sStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<K3sStatus>({
      key: K3S_CACHE_KEY,
      category: OPERATOR_REFRESH_CATEGORY,
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(K3S_DEMO_DATA),
      persist: true,
      fetcher: fetchK3sStatus,
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
