import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import {
  FLUX_DEMO_DATA,
  type FluxResourceStatus,
  type FluxStatusData,
} from './demoData'

const CACHE_KEY = 'flux-status'

const INITIAL_DATA: FluxStatusData = {
  health: 'not-installed',
  sources: { total: 0, ready: 0, notReady: 0 },
  kustomizations: { total: 0, ready: 0, notReady: 0 },
  helmReleases: { total: 0, ready: 0, notReady: 0 },
  resources: {
    sources: [],
    kustomizations: [],
    helmReleases: [],
  },
  lastCheckTime: new Date().toISOString(),
}

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface CustomResourceItem {
  name: string
  namespace?: string
  cluster?: string
  status?: Record<string, unknown>
}

interface GitOpsKustomization {
  name: string
  namespace: string
  sourceRef?: string
  ready?: boolean
  status?: string
  message?: string
  lastApplied?: string
  cluster?: string
}

interface GitOpsHelmRelease {
  name: string
  namespace: string
  status?: string
  chart?: string
  updated?: string
  cluster?: string
}

interface CustomResourceResponse {
  items?: CustomResourceItem[]
}

interface KustomizationResponse {
  kustomizations?: GitOpsKustomization[]
}

interface HelmReleaseResponse {
  releases?: GitOpsHelmRelease[]
}

function summarize(items: FluxResourceStatus[]) {
  const total = items.length
  const ready = items.filter(item => item.ready).length
  return {
    total,
    ready,
    notReady: total - ready,
  }
}

function getReadyCondition(status?: Record<string, unknown>): { ready: boolean; reason?: string } {
  const conditions = Array.isArray(status?.conditions) ? status.conditions : []
  for (const condition of conditions) {
    const c = condition as Record<string, unknown>
    if (c.type !== 'Ready') continue
    const state = typeof c.status === 'string' ? c.status : ''
    return {
      ready: state === 'True',
      reason: typeof c.reason === 'string' ? c.reason : undefined,
    }
  }
  return { ready: false }
}

function getGitRevision(status?: Record<string, unknown>): string | undefined {
  if (typeof status?.lastAppliedRevision === 'string') return status.lastAppliedRevision
  const artifact = (status?.artifact ?? {}) as Record<string, unknown>
  if (typeof artifact.revision === 'string') return artifact.revision
  return undefined
}

function isHelmReleaseReady(status: string | undefined): boolean {
  const normalized = (status || '').toLowerCase()
  return normalized === 'deployed' || normalized === 'superseded'
}

async function fetchJson<T>(
  url: string,
  options?: { treat404AsEmpty?: boolean },
): Promise<FetchResult<T | null>> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
      if (options?.treat404AsEmpty && resp.status === 404) {
        return { data: null, failed: false }
      }
      return { data: null, failed: true }
    }

    const body = (await resp.json()) as T
    return { data: body, failed: false }
  } catch {
    return { data: null, failed: true }
  }
}

async function fetchGitRepositories(): Promise<FetchResult<FluxResourceStatus[]>> {
  const params = new URLSearchParams({
    group: 'source.toolkit.fluxcd.io',
    version: 'v1',
    resource: 'gitrepositories',
  })

  const result = await fetchJson<CustomResourceResponse>(
    `/api/mcp/custom-resources?${params.toString()}`,
    { treat404AsEmpty: true },
  )

  const items = result.data?.items || []
  return {
    failed: result.failed,
    data: items.map(item => {
      const condition = getReadyCondition(item.status)
      return {
        kind: 'GitRepository',
        name: item.name,
        namespace: item.namespace || 'default',
        cluster: item.cluster || 'default',
        ready: condition.ready,
        reason: condition.reason,
        revision: getGitRevision(item.status),
      } satisfies FluxResourceStatus
    }),
  }
}

async function fetchKustomizations(): Promise<FetchResult<FluxResourceStatus[]>> {
  const result = await fetchJson<KustomizationResponse>('/api/gitops/kustomizations')
  const items = result.data?.kustomizations || []

  return {
    failed: result.failed,
    data: items.map(item => ({
      kind: 'Kustomization',
      name: item.name,
      namespace: item.namespace || 'default',
      cluster: item.cluster || 'default',
      ready: !!item.ready,
      reason: item.ready ? undefined : (item.message || item.status),
      revision: item.lastApplied,
      lastUpdated: item.lastApplied,
    })),
  }
}

async function fetchHelmReleases(): Promise<FetchResult<FluxResourceStatus[]>> {
  const result = await fetchJson<HelmReleaseResponse>('/api/gitops/helm-releases')
  const items = result.data?.releases || []

  return {
    failed: result.failed,
    data: items.map(item => ({
      kind: 'HelmRelease',
      name: item.name,
      namespace: item.namespace || 'default',
      cluster: item.cluster || 'default',
      ready: isHelmReleaseReady(item.status),
      reason: isHelmReleaseReady(item.status) ? undefined : item.status,
      revision: item.chart,
      lastUpdated: item.updated,
    })),
  }
}

function buildFluxStatus(
  sources: FluxResourceStatus[],
  kustomizations: FluxResourceStatus[],
  helmReleases: FluxResourceStatus[],
): FluxStatusData {
  const sourceSummary = summarize(sources)
  const kustomizationSummary = summarize(kustomizations)
  const helmSummary = summarize(helmReleases)

  const totalResources = sourceSummary.total + kustomizationSummary.total + helmSummary.total
  const totalNotReady = sourceSummary.notReady + kustomizationSummary.notReady + helmSummary.notReady

  let health: FluxStatusData['health'] = 'healthy'
  if (totalResources === 0) {
    health = 'not-installed'
  } else if (totalNotReady > 0) {
    health = 'degraded'
  }

  return {
    health,
    sources: sourceSummary,
    kustomizations: kustomizationSummary,
    helmReleases: helmSummary,
    resources: {
      sources,
      kustomizations,
      helmReleases,
    },
    lastCheckTime: new Date().toISOString(),
  }
}

async function fetchFluxStatus(): Promise<FluxStatusData> {
  const [sourceResult, kustomizationResult, helmResult] = await Promise.all([
    fetchGitRepositories(),
    fetchKustomizations(),
    fetchHelmReleases(),
  ])

  if (sourceResult.failed && kustomizationResult.failed && helmResult.failed) {
    throw new Error('Unable to fetch Flux status')
  }

  return buildFluxStatus(sourceResult.data, kustomizationResult.data, helmResult.data)
}

export interface UseFluxStatusResult {
  data: FluxStatusData
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useFluxStatus(): UseFluxStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<FluxStatusData>({
      key: CACHE_KEY,
      category: 'gitops',
      initialData: INITIAL_DATA,
      demoData: FLUX_DEMO_DATA,
      persist: true,
      fetcher: fetchFluxStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const totalResources = data.sources.total + data.kustomizations.total + data.helmReleases.total
  const hasAnyData = data.health === 'not-installed' ? true : totalResources > 0

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
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}

export const __testables = {
  summarize,
  getReadyCondition,
  getGitRevision,
  isHelmReleaseReady,
  buildFluxStatus,
}
