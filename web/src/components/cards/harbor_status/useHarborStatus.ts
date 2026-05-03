import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import {
  HARBOR_DEMO_DATA,
  type HarborDemoData,
  type HarborProject,
  type HarborRepository,
  type HarborProjectStatus,
  type HarborVulnSummary,
} from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'

export type HarborStatus = HarborDemoData

// Re-export types consumed by the component
export type {
  HarborProject,
  HarborRepository,
  HarborProjectStatus,
  HarborVulnSummary,
}

const INITIAL_DATA: HarborStatus = {
  health: 'not-installed',
  instanceName: '',
  version: '',
  projects: [],
  repositories: [],
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'harbor-status'

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

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isHarborPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const ns = (pod.namespace ?? '').toLowerCase()
  const name = (pod.name ?? '').toLowerCase()
  const isHarborControllerByName =
    (ns === 'harbor' || ns === 'harbor-system') &&
    (
      name.includes('harbor-core') ||
      name.includes('harbor-jobservice') ||
      name.includes('harbor-registry') ||
      name.includes('harbor-portal')
    )
  return (
    labels['app'] === 'harbor' ||
    labels['app.kubernetes.io/name'] === 'harbor' ||
    labels['app.kubernetes.io/part-of'] === 'harbor' ||
    isHarborControllerByName
  )
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchHarborStatus(): Promise<HarborStatus> {
  // Try to detect Harbor pods to verify installation
  const labeledPods = await fetchPods(
    `${LOCAL_AGENT_HTTP_URL}/pods?labelSelector=app%3Dharbor`,
  ).catch(() => [] as BackendPodInfo[])

  let harborPods = labeledPods.filter(isHarborPod)

  if (harborPods.length === 0) {
    const nsPods = await fetchPods(
      `${LOCAL_AGENT_HTTP_URL}/pods?namespace=harbor`,
    ).catch(() => [] as BackendPodInfo[])
    harborPods = nsPods.filter(isHarborPod)
  }

  if (harborPods.length === 0) {
    const nsPods2 = await fetchPods(
      `${LOCAL_AGENT_HTTP_URL}/pods?namespace=harbor-system`,
    ).catch(() => [] as BackendPodInfo[])
    harborPods = nsPods2.filter(isHarborPod)
  }

  // Fallback: unfiltered pod list
  if (harborPods.length === 0) {
    const allPods = await fetchPods(`${LOCAL_AGENT_HTTP_URL}/pods`)
      .catch(() => [] as BackendPodInfo[])
    harborPods = allPods.filter(isHarborPod)
  }

  if (harborPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  // Without direct Harbor API access, CRDs are our best source of info if they exist.
  // Generally, Harbor instances are managed by Helm or Operator.
  // We'll return a degraded state or healthy depending on pod readiness if no CRDs are available.
  const readyPods = harborPods.filter(p => {
    if (p.status?.toLowerCase() !== 'running') return false
    const parts = (p.ready || '').split('/')
    if (parts.length !== 2) return false
    return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
  })

  const health = readyPods.length === harborPods.length && harborPods.length > 0 ? 'healthy' : 'degraded'

  const instanceName = harborPods[0]?.labels?.['app.kubernetes.io/instance'] || harborPods[0]?.namespace || 'harbor'
  const version = harborPods[0]?.labels?.['app.kubernetes.io/version'] || 'unknown'

  return {
    health,
    instanceName,
    version,
    projects: [], // Live data would require polling Harbor API or custom CRDs
    repositories: [],
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseHarborStatusResult {
  data: HarborStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  lastRefresh: number | null
  isDemoFallback: boolean
}

export function useHarborStatus(): UseHarborStatusResult {
  const { isDemoMode } = useDemoMode()

  const {
    data: liveData,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    isDemoFallback,
    lastRefresh,
  } = useCache<HarborStatus>({
    key: CACHE_KEY,
    category: 'default',
    initialData: INITIAL_DATA,
    demoData: HARBOR_DEMO_DATA,
    persist: true,
    fetcher: fetchHarborStatus,
  })

  const data = isDemoMode ? HARBOR_DEMO_DATA : liveData
  const effectiveIsDemoData = isDemoMode || (isDemoFallback && !isLoading)

  const hasAnyData =
    (data.projects || []).length > 0 ||
    (data.repositories || []).length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !isDemoMode,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading && !isDemoMode,
    isRefreshing,
    error: isFailed && !hasAnyData && !isDemoMode,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
    lastRefresh,
    isDemoFallback: effectiveIsDemoData,
  }
}
