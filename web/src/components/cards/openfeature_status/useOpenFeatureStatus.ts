import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { OPENFEATURE_DEMO_DATA } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
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

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
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
  isDemoData?: boolean
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

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

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

function extractProviderName(pod: BackendPodInfo): string {
  const labels = pod.labels ?? {}
  const annotations = pod.annotations ?? {}

  if (labels['openfeature.dev/provider']) {
    return labels['openfeature.dev/provider']
  }

  if (labels['app.kubernetes.io/name'] === 'flagd' || labels['app'] === 'flagd') {
    return 'flagd'
  }

  if (annotations['openfeature.dev/provider-type']) {
    return annotations['openfeature.dev/provider-type']
  }

  const name = pod.name ?? ''
  if (name.startsWith('flagd-')) return 'flagd'
  if (name.includes('launchdarkly')) return 'launchdarkly'
  if (name.includes('split')) return 'split'

  return 'unknown'
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

/** Count flags from an OpenFeature FeatureFlagConfiguration CRD. */
function countFlags(items: CRItem[]): { total: number; enabled: number; disabled: number } {
  let total = 0
  let enabled = 0
  let disabled = 0

  for (const item of items) {
    const spec = (item.spec ?? {}) as Record<string, unknown>

    // OpenFeature stores flags in spec.flagSpec.flags or spec.featureFlagSpec
    const flagSpec = (spec.flagSpec ?? spec.featureFlagSpec ?? {}) as Record<string, unknown>
    const flags = (flagSpec.flags ?? {}) as Record<string, unknown>

    for (const flagName of Object.keys(flags)) {
      const flag = flags[flagName] as Record<string, unknown>
      total++
      const state = ((flag.state as string) ?? '').toUpperCase()
      if (state === 'DISABLED') {
        disabled++
      } else {
        enabled++
      }
    }
  }

  return { total, enabled, disabled }
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchOpenFeatureStatus(): Promise<OpenFeatureStatus> {
  // Step 1: Detect OpenFeature pods
  const resp = await authFetch('/api/mcp/pods', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: { pods?: BackendPodInfo[] } = await resp.json()
  const pods = Array.isArray(body?.pods) ? body.pods : []

  const openFeaturePods = pods.filter(isOpenFeaturePod)

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
      evaluations: 0,
      cacheHitRate: 0,
    }
  })

  const readyPods = openFeaturePods.filter(isPodReady).length
  const totalPods = openFeaturePods.length

  let health: 'healthy' | 'degraded' | 'not-installed' = 'healthy'
  if (readyPods === 0) {
    health = 'degraded'
  } else if (readyPods < totalPods) {
    health = 'degraded'
  }

  // Step 2: Fetch FeatureFlagConfiguration CRDs (best-effort)
  const flagItems = await fetchCR('core.openfeature.dev', 'v1beta1', 'featureflagconfigurations')
  const flagStats = countFlags(flagItems)

  return {
    health,
    providers,
    featureFlags: {
      total: flagStats.total,
      enabled: flagStats.enabled,
      disabled: flagStats.disabled,
      errorRate: 0,
    },
    totalEvaluations: 0,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseOpenFeatureStatusResult {
  data: OpenFeatureStatus
  error: boolean
  isRefreshing: boolean
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useOpenFeatureStatus(): UseOpenFeatureStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } = useCache<OpenFeatureStatus>({
    key: CACHE_KEY,
    fetcher: fetchOpenFeatureStatus,
    demoData: OPENFEATURE_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
  })

  const effectiveIsDemoData = isDemoFallback && !isLoading

  const hasAnyData = (data.providers || []).length > 0 || data.health !== 'not-installed'

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isDemoData: effectiveIsDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
  })

  return {
    data,
    error: isFailed && !hasAnyData,
    isRefreshing,
    showSkeleton,
    showEmptyState,
  }
}
