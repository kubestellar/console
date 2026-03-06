import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { OPENFEATURE_DEMO_DATA } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import type { OpenFeatureDemoData } from './demoData'

export type OpenFeatureStatus = OpenFeatureDemoData

const INITIAL_DATA: OpenFeatureStatus = {
  health: 'not-installed',
  providers: [],
  featureFlags: { total: 0, enabled: 0, disabled: 0, errorRate: 0 },
  totalEvaluations: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'openfeature-status'

/**
 * Minimal pod shape returned by /api/mcp/pods.
 */
interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

/**
 * Detect whether a pod belongs to OpenFeature components.
 * OpenFeature pods typically have labels like:
 * - app.kubernetes.io/name=flagd
 * - app=openfeature-operator
 * - openfeature.dev/provider=*
 */
function isOpenFeaturePod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app.kubernetes.io/name'] === 'flagd' ||
    labels['app'] === 'openfeature-operator' ||
    labels['app'] === 'flagd' ||
    'openfeature.dev/provider' in labels ||
    name.startsWith('flagd-') ||
    name.startsWith('openfeature-')
  )
}

/**
 * Determine if a pod is running/ready.
 */
function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

/**
 * Extract provider name from pod labels/annotations.
 */
function extractProviderName(pod: BackendPodInfo): string {
  const labels = pod.labels ?? {}
  const annotations = pod.annotations ?? {}
  
  // Check for explicit provider label
  if (labels['openfeature.dev/provider']) {
    return labels['openfeature.dev/provider']
  }
  
  // Check for flagd
  if (labels['app.kubernetes.io/name'] === 'flagd' || labels['app'] === 'flagd') {
    return 'flagd'
  }
  
  // Check annotations for provider hints
  if (annotations['openfeature.dev/provider-type']) {
    return annotations['openfeature.dev/provider-type']
  }
  
  // Fallback to pod name pattern
  const name = pod.name ?? ''
  if (name.startsWith('flagd-')) return 'flagd'
  if (name.includes('launchdarkly')) return 'launchdarkly'
  if (name.includes('split')) return 'split'
  
  return 'unknown'
}

async function fetchOpenFeatureStatus(): Promise<OpenFeatureStatus> {
  const resp = await fetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const openFeaturePods = pods.filter(isOpenFeaturePod)

  // If no OpenFeature pods found → not installed
  if (openFeaturePods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  // Group pods by provider
  const providerMap = new Map<string, { total: number; ready: number }>()
  for (const pod of openFeaturePods) {
    const provider = extractProviderName(pod)
    const stats = providerMap.get(provider) ?? { total: 0, ready: 0 }
    stats.total++
    if (isPodReady(pod)) stats.ready++
    providerMap.set(provider, stats)
  }

  // Build provider stats (simplified for live data - no evaluations/cache from pods alone)
  const providers = Array.from(providerMap.entries()).map(([name, stats]) => {
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (stats.ready === 0) {
      status = 'unhealthy'
    } else if (stats.ready < stats.total) {
      status = 'degraded'
    }
    
    return {
      name,
      status,
      evaluations: 0, // Would need metrics endpoint for real data
      cacheHitRate: 0,
    }
  })

  const readyPods = openFeaturePods.filter(isPodReady).length
  const totalPods = openFeaturePods.length

  // Determine overall health
  let health: 'healthy' | 'degraded' | 'not-installed' = 'healthy'
  if (readyPods === 0) {
    health = 'degraded'
  } else if (readyPods < totalPods) {
    health = 'degraded'
  }

  return {
    health,
    providers,
    featureFlags: {
      total: 0, // Would need API integration for real flag data
      enabled: 0,
      disabled: 0,
      errorRate: 0,
    },
    totalEvaluations: 0,
    lastCheckTime: new Date().toISOString(),
  }
}

export interface UseOpenFeatureStatusResult {
  data: OpenFeatureStatus
  error: boolean
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useOpenFeatureStatus(): UseOpenFeatureStatusResult {
  const cacheResult = useCache<OpenFeatureStatus>({
    key: CACHE_KEY,
    fetcher: fetchOpenFeatureStatus,
    demoData: OPENFEATURE_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
  })

  const hasAnyData = cacheResult.data.providers.length > 0 || cacheResult.data.health !== 'not-installed'

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: cacheResult.isLoading,
    isDemoData: cacheResult.isDemoFallback,
    hasAnyData,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
  })

  return {
    data: cacheResult.data,
    error: cacheResult.isFailed && !hasAnyData,
    showSkeleton,
    showEmptyState,
  }
}
