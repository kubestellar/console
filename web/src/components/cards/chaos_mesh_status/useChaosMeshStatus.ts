import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { authFetch } from '../../../lib/api'
import {
  CHAOS_MESH_DEMO_DATA,
  INITIAL_DATA,
  type ChaosMeshExperiment,
  type ChaosMeshStatusData,
  type ChaosMeshWorkflow,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'chaos-mesh-status'

/** Chaos Mesh CR condition `status` when the condition applies. */
const CHAOS_MESH_CONDITION_STATUS_TRUE = 'True'

/** Chaos Mesh CR `status.conditions[].type` values used for phase derivation. */
const CHAOS_MESH_CONDITION_TYPE_PAUSED = 'Paused'
const CHAOS_MESH_CONDITION_TYPE_FAILED = 'Failed'
const CHAOS_MESH_CONDITION_TYPE_ALL_RECOVERED = 'AllRecovered'
const CHAOS_MESH_CONDITION_TYPE_ALL_INJECTED = 'AllInjected'
const CHAOS_MESH_CONDITION_TYPE_SELECTED = 'Selected'

const DEFAULT_NAMESPACE = 'default'

// ---------------------------------------------------------------------------
// Internal Types — GET /api/mcp/custom-resources items (flat + optional legacy metadata)
// ---------------------------------------------------------------------------

interface ChaosMeshCustomResourceItem {
  metadata?: {
    name?: string
    namespace?: string
  }
  name?: string
  namespace?: string
  cluster?: string
  kind?: string
  status?: Record<string, unknown>
}

interface CustomResourceResponse {
  items?: ChaosMeshCustomResourceItem[]
}

interface ChaosMeshCondition {
  type?: string
  status?: string
}

function resolveItemName(e: ChaosMeshCustomResourceItem): string {
  return e.name ?? e.metadata?.name ?? ''
}

function resolveItemNamespace(e: ChaosMeshCustomResourceItem): string {
  const ns = e.namespace ?? e.metadata?.namespace
  return ns && ns.length > 0 ? ns : DEFAULT_NAMESPACE
}

// ---------------------------------------------------------------------------
// Pure helpers (exported via __testables for unit testing)
// ---------------------------------------------------------------------------

function chaosConditionIsTrue(conditions: unknown, conditionType: string): boolean {
  if (!Array.isArray(conditions)) {
    return false
  }
  for (const c of conditions) {
    if (!c || typeof c !== 'object') {
      continue
    }
    const row = c as ChaosMeshCondition
    if (row.type === conditionType && row.status === CHAOS_MESH_CONDITION_STATUS_TRUE) {
      return true
    }
  }
  return false
}

function derivePhaseFromConditions(conditions: unknown): string {
  if (chaosConditionIsTrue(conditions, CHAOS_MESH_CONDITION_TYPE_PAUSED)) {
    return 'Paused'
  }
  if (chaosConditionIsTrue(conditions, CHAOS_MESH_CONDITION_TYPE_FAILED)) {
    return 'Failed'
  }
  if (chaosConditionIsTrue(conditions, CHAOS_MESH_CONDITION_TYPE_ALL_RECOVERED)) {
    return 'Finished'
  }
  if (chaosConditionIsTrue(conditions, CHAOS_MESH_CONDITION_TYPE_ALL_INJECTED)) {
    return 'Running'
  }
  if (chaosConditionIsTrue(conditions, CHAOS_MESH_CONDITION_TYPE_SELECTED)) {
    return 'Running'
  }
  return 'Unknown'
}

function coerceCardPhase(phase: string): ChaosMeshExperiment['phase'] {
  if (phase === 'Running' || phase === 'Finished' || phase === 'Failed' || phase === 'Paused' || phase === 'Unknown') {
    return phase
  }
  return 'Unknown'
}

/** Phase for PodChaos and other chaos-mesh.org experiment CRs (conditions or legacy phase string). */
function getExperimentPhase(item: unknown): string {
  const obj = item as ChaosMeshCustomResourceItem
  if (typeof obj?.status?.phase === 'string' && obj.status.phase.length > 0) {
    return obj.status.phase
  }
  return derivePhaseFromConditions(obj?.status?.conditions)
}

/** Phase for Workflow CRs — prefer status.phase, else conditions. */
function getWorkflowPhase(item: unknown): string {
  const obj = item as ChaosMeshCustomResourceItem
  if (typeof obj?.status?.phase === 'string' && obj.status.phase.length > 0) {
    return obj.status.phase
  }
  return derivePhaseFromConditions(obj?.status?.conditions)
}

function isExperimentFailed(item: unknown): boolean {
  return getExperimentPhase(item) === 'Failed'
}

function buildChaosMeshStatus(
  experiments: ChaosMeshCustomResourceItem[],
  workflows: ChaosMeshCustomResourceItem[],
): ChaosMeshStatusData {
  if (experiments.length === 0 && workflows.length === 0) {
    return INITIAL_DATA
  }

  const mappedExperiments: ChaosMeshExperiment[] = experiments.map(e => ({
    name: resolveItemName(e),
    namespace: resolveItemNamespace(e),
    cluster: e.cluster,
    kind: e.kind && e.kind.length > 0 ? e.kind : 'Unknown',
    phase: coerceCardPhase(getExperimentPhase(e)),
    startTime: typeof e.status?.startTime === 'string' ? e.status.startTime : '',
  }))

  const mappedWorkflows: ChaosMeshWorkflow[] = workflows.map(w => ({
    name: resolveItemName(w),
    namespace: resolveItemNamespace(w),
    cluster: w.cluster,
    phase: coerceCardPhase(getWorkflowPhase(w)) as ChaosMeshWorkflow['phase'],
    progress: typeof w.status?.progress === 'string' ? w.status.progress : '0/0',
  }))

  const summary = {
    totalExperiments: mappedExperiments.length,
    running: mappedExperiments.filter(e => e.phase === 'Running').length,
    finished: mappedExperiments.filter(e => e.phase === 'Finished').length,
    failed: mappedExperiments.filter(e => e.phase === 'Failed').length,
  }

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
  refetch: () => Promise<void>
}

export function useChaosMeshStatus(): UseChaosMeshStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback, refetch } =
    useCache<ChaosMeshStatusData>({
      key: CACHE_KEY,
      category: 'realtime',
      initialData: INITIAL_DATA,
      demoData: CHAOS_MESH_DEMO_DATA,
      persist: true,
      fetcher: fetchChaosMeshStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const workflowCount = (data.workflows || []).length
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalExperiments > 0 || workflowCount > 0

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
    refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  getExperimentPhase,
  getWorkflowPhase,
  isExperimentFailed,
  buildChaosMeshStatus,
  coerceCardPhase,
  derivePhaseFromConditions,
}
