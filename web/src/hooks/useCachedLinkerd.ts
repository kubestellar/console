/**
 * Linkerd Service Mesh Status Hook — Data fetching for the linkerd_status card.
 *
 * Uses createCardCachedHook factory for zero-boilerplate caching.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  LINKERD_DEMO_DATA,
  type LinkerdMeshedDeployment,
  type LinkerdStats,
  type LinkerdStatusData,
} from '../components/cards/linkerd_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'linkerd-status'
const LINKERD_STATUS_ENDPOINT = '/api/linkerd/status'
const DEFAULT_CONTROL_PLANE_VERSION = 'unknown'
const FULLY_MESHED_SUCCESS_THRESHOLD_PCT = 99.0

const EMPTY_STATS: LinkerdStats = {
  totalRps: 0,
  avgSuccessRatePct: 0,
  avgP99LatencyMs: 0,
  controlPlaneVersion: DEFAULT_CONTROL_PLANE_VERSION,
}

const INITIAL_DATA: LinkerdStatusData = {
  health: 'not-installed',
  deployments: [],
  stats: EMPTY_STATS,
  summary: {
    totalDeployments: 0,
    fullyMeshedDeployments: 0,
    totalMeshedPods: 0,
    totalPods: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/linkerd/status response)
// ---------------------------------------------------------------------------

interface LinkerdStatusResponse {
  deployments?: LinkerdMeshedDeployment[]
  stats?: Partial<LinkerdStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(deployments: LinkerdMeshedDeployment[]) {
  const totalDeployments = deployments.length
  const fullyMeshedDeployments = deployments.filter(d => d.status === 'meshed').length
  const totalMeshedPods = deployments.reduce((sum, d) => sum + d.meshedPods, 0)
  const totalPods = deployments.reduce((sum, d) => sum + d.totalPods, 0)
  return { totalDeployments, fullyMeshedDeployments, totalMeshedPods, totalPods }
}

function deriveHealth(
  deployments: LinkerdMeshedDeployment[],
): LinkerdStatusData['health'] {
  if (deployments.length === 0) {
    return 'not-installed'
  }
  const hasUnhealthy = deployments.some(
    d =>
      d.status !== 'meshed' ||
      d.successRatePct < FULLY_MESHED_SUCCESS_THRESHOLD_PCT,
  )
  return hasUnhealthy ? 'degraded' : 'healthy'
}

function buildLinkerdStatus(
  deployments: LinkerdMeshedDeployment[],
  stats: LinkerdStats,
): LinkerdStatusData {
  return {
    health: deriveHealth(deployments),
    deployments,
    stats,
    summary: summarize(deployments),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchLinkerdStatus(): Promise<LinkerdStatusData> {
  const result = await fetchJson<LinkerdStatusResponse>(LINKERD_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch Linkerd status')
  }

  const body = result.data
  const deployments = Array.isArray(body?.deployments) ? body.deployments : []
  const stats: LinkerdStats = {
    totalRps: body?.stats?.totalRps ?? 0,
    avgSuccessRatePct: body?.stats?.avgSuccessRatePct ?? 0,
    avgP99LatencyMs: body?.stats?.avgP99LatencyMs ?? 0,
    controlPlaneVersion: body?.stats?.controlPlaneVersion ?? DEFAULT_CONTROL_PLANE_VERSION,
  }

  return buildLinkerdStatus(deployments, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedLinkerd = createCardCachedHook<LinkerdStatusData>({
  key: CACHE_KEY,
  category: 'services',
  initialData: INITIAL_DATA,
  demoData: LINKERD_DEMO_DATA,
  fetcher: fetchLinkerdStatus,
  hasAnyData: (data) =>
    data.health === 'not-installed' ? true : data.deployments.length > 0,
})

export type UseCachedLinkerdResult = CardCachedHookResult<LinkerdStatusData>

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildLinkerdStatus,
}
