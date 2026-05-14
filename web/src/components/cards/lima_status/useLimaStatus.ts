import { createCachedHook } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { LIMA_DEMO_DATA, type LimaDemoData, type LimaInstance } from './demoData'
import { authFetch } from '../../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

export interface LimaStatus {
  instances: LimaInstance[]
  totalNodes: number
  runningNodes: number
  stoppedNodes: number
  brokenNodes: number
  health: 'healthy' | 'degraded' | 'not-detected'
  totalCpuCores: number
  totalMemoryGB: number
  lastCheckTime: string
}

const INITIAL_DATA: LimaStatus = {
  instances: [],
  totalNodes: 0,
  runningNodes: 0,
  stoppedNodes: 0,
  brokenNodes: 0,
  health: 'not-detected',
  totalCpuCores: 0,
  totalMemoryGB: 0,
  lastCheckTime: new Date().toISOString(),
}

const STATUS_SERVICE_UNAVAILABLE = 503

interface LimaListResponse {
  limaInstances: LimaInstance[]
  isDemoData: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLimaStatus(instances: LimaInstance[], lastCheckTime?: string): LimaStatus {
  const runningNodes = instances.filter(i => i.status === 'running').length
  const stoppedNodes = instances.filter(i => i.status === 'stopped').length
  const brokenNodes = instances.filter(i => i.status === 'broken').length

  const totalCpuCores = instances.reduce((sum, i) => sum + i.cpuCores, 0)
  const totalMemoryGB = instances.reduce((sum, i) => sum + i.memoryGB, 0)

  const health: 'healthy' | 'degraded' | 'not-detected' =
    instances.length === 0
      ? 'not-detected'
      : (brokenNodes > 0 || stoppedNodes > 0 ? 'degraded' : 'healthy')

  return {
    instances,
    totalNodes: instances.length,
    runningNodes,
    stoppedNodes,
    brokenNodes,
    health,
    totalCpuCores,
    totalMemoryGB,
    lastCheckTime: lastCheckTime || new Date().toISOString(),
  }
}

function toDemoStatus(demo: LimaDemoData): LimaStatus {
  return {
    instances: demo.instances,
    totalNodes: demo.totalNodes,
    runningNodes: demo.runningNodes,
    stoppedNodes: demo.stoppedNodes,
    brokenNodes: demo.brokenNodes,
    health: demo.health,
    totalCpuCores: demo.totalCpuCores,
    totalMemoryGB: demo.totalMemoryGB,
    lastCheckTime: demo.lastCheckTime,
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchLimaStatus(): Promise<LimaStatus> {
  const res = await authFetch('/api/lima', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (res.status === STATUS_SERVICE_UNAVAILABLE) {
    throw new Error('Service unavailable')
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const response = (await res.json()) as LimaListResponse
  if (response.isDemoData) {
    throw new Error('Backend returned demo data indicator')
  }

  const liveInstances = response.limaInstances || []
  return buildLimaStatus(liveInstances)
}

// ---------------------------------------------------------------------------
// Hook (using createCachedHook factory)
// ---------------------------------------------------------------------------

const useCachedLima = createCachedHook<LimaStatus>({
  key: 'lima-status',
  initialData: INITIAL_DATA,
  demoData: toDemoStatus(LIMA_DEMO_DATA),
  fetcher: fetchLimaStatus,
})

// ---------------------------------------------------------------------------
// Legacy wrapper (preserves existing return shape for consumers)
// ---------------------------------------------------------------------------

export interface UseLimaStatusResult {
  data: LimaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoData: boolean
}

export function useLimaStatus(): UseLimaStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedLima()

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.totalNodes > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    lastRefresh,
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
