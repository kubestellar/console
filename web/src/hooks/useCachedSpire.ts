/**
 * useCachedSpire — Cached hook for SPIRE (SPIFFE Runtime Environment) status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real SPIRE bridge lands (for example /api/spire/status backed by the
 * SPIRE server admin API surfacing server pods, agent DaemonSet, attested
 * agent count, and registration entry count), the fetcher picks up live
 * data automatically with no component changes.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  SPIRE_DEMO_DATA,
  type SpireAgentDaemonSet,
  type SpireHealth,
  type SpireServerPod,
  type SpireStatusData,
  type SpireSummary,
} from '../lib/demo/spire'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_SPIRE = 'spire-status'
const SPIRE_STATUS_ENDPOINT = '/api/spire/status'
const DEFAULT_VERSION = 'unknown'
const DEFAULT_TRUST_DOMAIN = ''

const NOT_FOUND_STATUS = 404

const INITIAL_SUMMARY: SpireSummary = {
  registrationEntries: 0,
  attestedAgents: 0,
  trustBundleAgeHours: 0,
  serverReadyReplicas: 0,
  serverDesiredReplicas: 0,
}

const INITIAL_DATA: SpireStatusData = {
  health: 'not-installed',
  version: DEFAULT_VERSION,
  trustDomain: DEFAULT_TRUST_DOMAIN,
  serverPods: [],
  agentDaemonSet: null,
  summary: INITIAL_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/spire/status response)
// ---------------------------------------------------------------------------

interface SpireStatusResponse {
  version?: string
  trustDomain?: string
  serverPods?: SpireServerPod[]
  agentDaemonSet?: SpireAgentDaemonSet | null
  summary?: Partial<SpireSummary>
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function countReadyPods(pods: SpireServerPod[]): number {
  let ready = 0
  for (const pod of pods ?? []) {
    if (pod.ready && pod.phase === 'Running') ready += 1
  }
  return ready
}

function deriveHealth(
  serverPods: SpireServerPod[],
  agentDaemonSet: SpireAgentDaemonSet | null,
  summary: SpireSummary,
): SpireHealth {
  const hasServerPods = (serverPods ?? []).length > 0
  const hasAgent = agentDaemonSet !== null && agentDaemonSet !== undefined

  if (!hasServerPods && !hasAgent) return 'not-installed'

  // Any server pod not ready → degraded
  const readyPods = countReadyPods(serverPods)
  const expectedServerReplicas =
    summary.serverDesiredReplicas > 0
      ? summary.serverDesiredReplicas
      : (serverPods ?? []).length
  if (expectedServerReplicas > 0 && readyPods < expectedServerReplicas) {
    return 'degraded'
  }

  // Agent DaemonSet coverage check — any node missing an agent → degraded
  if (agentDaemonSet) {
    if (agentDaemonSet.numberReady < agentDaemonSet.desiredNumberScheduled) {
      return 'degraded'
    }
    if (agentDaemonSet.numberMisscheduled > 0) return 'degraded'
  }

  return 'healthy'
}

function buildSpireStatus(
  version: string,
  trustDomain: string,
  serverPods: SpireServerPod[],
  agentDaemonSet: SpireAgentDaemonSet | null,
  summaryIn: Partial<SpireSummary>,
): SpireStatusData {
  const normalizedPods = serverPods ?? []
  const readyPods = countReadyPods(normalizedPods)
  const desiredReplicas =
    typeof summaryIn.serverDesiredReplicas === 'number'
      ? summaryIn.serverDesiredReplicas
      : normalizedPods.length
  const summary: SpireSummary = {
    registrationEntries: summaryIn.registrationEntries ?? 0,
    attestedAgents:
      summaryIn.attestedAgents ?? (agentDaemonSet?.numberReady ?? 0),
    trustBundleAgeHours: summaryIn.trustBundleAgeHours ?? 0,
    serverReadyReplicas: summaryIn.serverReadyReplicas ?? readyPods,
    serverDesiredReplicas: desiredReplicas,
  }
  return {
    health: deriveHealth(normalizedPods, agentDaemonSet ?? null, summary),
    version,
    trustDomain,
    serverPods: normalizedPods,
    agentDaemonSet: agentDaemonSet ?? null,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchSpireStatus(): Promise<SpireStatusData> {
  const resp = await authFetch(SPIRE_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (resp.status === NOT_FOUND_STATUS) {
      // Endpoint not yet wired — surface "not-installed" so the cache layer
      // will fall back to demo data instead of flagging a hard failure.
      return buildSpireStatus(DEFAULT_VERSION, DEFAULT_TRUST_DOMAIN, [], null, {})
    }
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as SpireStatusResponse
  const version = body.version ?? DEFAULT_VERSION
  const trustDomain = body.trustDomain ?? DEFAULT_TRUST_DOMAIN
  const serverPods = Array.isArray(body.serverPods) ? body.serverPods : []
  const agentDaemonSet = body.agentDaemonSet ?? null
  const summary = body.summary ?? {}
  return buildSpireStatus(version, trustDomain, serverPods, agentDaemonSet, summary)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedSpire(): CachedHookResult<SpireStatusData> {
  const result = useCache<SpireStatusData>({
    key: CACHE_KEY_SPIRE,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: SPIRE_DEMO_DATA,
    persist: true,
    fetcher: fetchSpireStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  countReadyPods,
  deriveHealth,
  buildSpireStatus,
}
