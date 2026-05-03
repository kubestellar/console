import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import {
  CHAOS_MESH_DEMO_DATA,
  INITIAL_DATA,
  type ChaosMeshStatusData,
  type ChaosMeshExperiment,
  type ChaosMeshWorkflow,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'chaos-mesh-status'

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface CustomResourceItem {
  metadata?: {
    name?: string
    namespace?: string
  }
  kind?: string
  status?: Record<string, unknown>
}

interface CustomResourceResponse {
  items?: CustomResourceItem[]
}

// ---------------------------------------------------------------------------
// Pure helpers (exported via __testables for unit testing)
// ---------------------------------------------------------------------------

function getExperimentPhase(item: unknown): string {
  const obj = item as CustomResourceItem
  if (typeof obj?.status?.phase === 'string') {
    return obj.status.phase
  }
  return 'Unknown'
}

function isExperimentFailed(item: unknown): boolean {
  return getExperimentPhase(item) === 'Failed'
}

function buildChaosMeshStatus(experiments: CustomResourceItem[], workflows: CustomResourceItem[]): ChaosMeshStatusData {
  if (experiments.length === 0) {
    return INITIAL_DATA
  }

  const mappedExperiments: ChaosMeshExperiment[] = experiments.map(e => ({
    name: e.metadata?.name ?? '',
    namespace: e.metadata?.namespace ?? 'default',
    kind: e.kind ?? 'Unknown',
    phase: getExperimentPhase(e) as ChaosMeshExperiment['phase'],
    startTime: typeof e.status?.startTime === 'string' ? e.status.startTime : '',
  }))

  const summary = {
    totalExperiments: mappedExperiments.length,
    running: mappedExperiments.filter(e => e.phase === 'Running').length,
    finished: mappedExperiments.filter(e => e.phase === 'Finished').length,
    failed: mappedExperiments.filter(e => e.phase === 'Failed').length,
  }

  const mappedWorkflows: ChaosMeshWorkflow[] = workflows.map(w => ({
    name: w.metadata?.name ?? '',
    namespace: w.metadata?.namespace ?? 'default',
    phase: (typeof w.status?.phase === 'string' ? w.status.phase : 'Unknown') as ChaosMeshWorkflow['phase'],
    progress: typeof w.status?.progress === 'string' ? w.status.progress : '0/0',
  }))

  return {
    experiments: mappedExperiments,
    workflows: mappedWorkflows,
    summary,
    health: summary.failed > 0 ? 'degraded' : 'healthy',
  }
}

// ---------------------------------------------------------------------------
// Fetch functions
// ---------------------------------------------------------------------------

async function fetchChaosMeshStatus(): Promise<ChaosMeshStatusData> {
  const [expsRes, wfsRes] = await Promise.all([
    // All chaos experiment CRDs live under chaos-mesh.org group
    authFetch('/api/mcp/custom-resources?group=chaos-mesh.org&version=v1alpha1&resource=podchaos', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
    authFetch('/api/mcp/custom-resources?group=chaos-mesh.org&version=v1alpha1&resource=workflows', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    }),
  ])

  if (!expsRes.ok) {
    throw new Error('Failed to fetch Chaos Mesh experiments')
  }

  const expsJson = (await expsRes.json()) as CustomResourceResponse
  
  let wfsJson: CustomResourceResponse = { items: [] }
  if (wfsRes.ok) {
    try {
      wfsJson = (await wfsRes.json()) as CustomResourceResponse
    } catch {
      // Ignore JSON parse errors for workflows, just use empty
    }
  }

  return buildChaosMeshStatus(expsJson.items ?? [], wfsJson.items ?? [])
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseChaosMeshStatusResult {
  data: ChaosMeshStatusData
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoData: boolean
}

export function useChaosMeshStatus(): UseChaosMeshStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<ChaosMeshStatusData>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: CHAOS_MESH_DEMO_DATA,
      persist: true,
      fetcher: fetchChaosMeshStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = data.health === 'not-installed' ? true : data.summary.totalExperiments > 0

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
    isDemoData: effectiveIsDemoData,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  getExperimentPhase,
  isExperimentFailed,
  buildChaosMeshStatus,
}
