/**
 * Hook for fetching and caching OVN-Kubernetes status data.
 *
 * Uses the unified cache layer with the 'operators' refresh category (300s).
 * Detection is based on pods with the `app` label matching ovnkube-node,
 * ovnkube-master, or ovnkube-controller. UDN info is extracted from
 * pod annotations.
 */

import { useCache } from '../../../../lib/cache'
import { useCardLoadingState } from '../../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../../lib/constants/network'
import { OVN_CACHE_KEY, OPERATOR_REFRESH_CATEGORY } from '../shared'
import type { ComponentHealth } from '../shared'
import type { UdnInfo } from './helpers'
import { isOvnPod, extractUdns, summarizeOvnPods } from './helpers'
import { OVN_DEMO_DATA, type OvnStatusDemoData } from './demoData'
import { LOCAL_AGENT_HTTP_URL } from '../../../../lib/constants/network'
import { agentFetch } from '../../../../hooks/mcp/shared'

// ============================================================================
// Data Interface
// ============================================================================

export interface OvnStatus {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  udns: UdnInfo[]
  lastCheckTime: string
}

// ============================================================================
// Initial Data
// ============================================================================

const INITIAL_DATA: OvnStatus = {
  detected: false,
  health: 'not-installed',
  podCount: 0,
  healthyPods: 0,
  unhealthyPods: 0,
  udns: [],
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
  annotations?: Record<string, string>
  containers?: Array<{
    image?: string
    state?: 'running' | 'waiting' | 'terminated'
    reason?: string
  }>
}

// ============================================================================
// Fetcher
// ============================================================================

/**
 * Fetch OVN-Kubernetes status by querying pods and filtering for OVN
 * infrastructure pods via label selectors.
 */
async function fetchOvnStatus(): Promise<OvnStatus> {
  const podsResp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pods`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!podsResp.ok) {
    // 401/403 = not authenticated — return empty so useCache falls back to demo data
    if (podsResp.status === 401 || podsResp.status === 403) {
      return { ...INITIAL_DATA, lastCheckTime: new Date().toISOString() }
    }
    throw new Error(`HTTP ${podsResp.status}`)
  }

  const podsBody: { pods?: BackendPodInfo[] } = await podsResp.json()
  const allPods = Array.isArray(podsBody?.pods) ? podsBody.pods : []

  // Filter for OVN infrastructure pods by label
  const ovnPods = allPods.filter((pod) => isOvnPod(pod.labels))

  if (ovnPods.length === 0) {
    return {
      ...INITIAL_DATA,
      detected: false,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const summary = summarizeOvnPods(ovnPods)

  // Extract UDN info from all cluster pods (not just OVN pods)
  const udns = extractUdns(allPods)

  // Determine health: degraded if any OVN pod is unhealthy
  const health: ComponentHealth = summary.unhealthy > 0 ? 'degraded' : 'healthy'

  return {
    detected: true,
    health,
    podCount: summary.total,
    healthyPods: summary.healthy,
    unhealthyPods: summary.unhealthy,
    udns,
    lastCheckTime: new Date().toISOString(),
  }
}

// ============================================================================
// Demo data converter
// ============================================================================

function toDemoStatus(demo: OvnStatusDemoData): OvnStatus {
  return {
    detected: demo.detected,
    health: demo.health,
    podCount: demo.podCount,
    healthyPods: demo.healthyPods,
    unhealthyPods: demo.unhealthyPods,
    udns: demo.udns,
    lastCheckTime: demo.lastCheckTime,
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UseOvnStatusResult {
  data: OvnStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoData: boolean
}

export function useOvnStatus(): UseOvnStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<OvnStatus>({
      key: OVN_CACHE_KEY,
      category: OPERATOR_REFRESH_CATEGORY,
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(OVN_DEMO_DATA),
      persist: true,
      fetcher: fetchOvnStatus,
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
