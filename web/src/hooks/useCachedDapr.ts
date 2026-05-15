/**
 * Dapr Status Hook — Data fetching for the dapr_status card.
 *
 * Keeps the public hook contract stable while sharing the common fetchJson helper.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  DAPR_DEMO_DATA,
  type DaprAppSidecar,
  type DaprBuildingBlockCounts,
  type DaprComponent,
  type DaprControlPlanePod,
  type DaprStatusData,
  type DaprSummary,
} from '../components/cards/dapr_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'dapr-status'
const DAPR_STATUS_ENDPOINT = '/api/dapr/status'

const EMPTY_APPS: DaprAppSidecar = {
  total: 0,
  namespaces: 0,
}

const EMPTY_BUILDING_BLOCKS: DaprBuildingBlockCounts = {
  stateStores: 0,
  pubsubs: 0,
  bindings: 0,
}

const INITIAL_DATA: DaprStatusData = {
  health: 'not-installed',
  controlPlane: [],
  components: [],
  apps: EMPTY_APPS,
  buildingBlocks: EMPTY_BUILDING_BLOCKS,
  summary: {
    totalControlPlanePods: 0,
    runningControlPlanePods: 0,
    totalComponents: 0,
    totalDaprApps: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/dapr/status response)
// ---------------------------------------------------------------------------

interface DaprStatusResponse {
  controlPlane?: DaprControlPlanePod[]
  components?: DaprComponent[]
  apps?: Partial<DaprAppSidecar>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function countByType(
  components: DaprComponent[],
  type: DaprComponent['type'],
): number {
  return components.filter(c => c.type === type).length
}

function summarize(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprSummary {
  return {
    totalControlPlanePods: controlPlane.length,
    runningControlPlanePods: controlPlane.filter(p => p.status === 'running').length,
    totalComponents: components.length,
    totalDaprApps: apps.total,
  }
}

function buildBuildingBlocks(components: DaprComponent[]): DaprBuildingBlockCounts {
  return {
    stateStores: countByType(components, 'state-store'),
    pubsubs: countByType(components, 'pubsub'),
    bindings: countByType(components, 'binding'),
  }
}

function deriveHealth(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprStatusData['health'] {
  if (controlPlane.length === 0 && components.length === 0 && apps.total === 0) {
    return 'not-installed'
  }
  const hasDegradedControlPlane = controlPlane.some(
    p => p.status !== 'running' || p.replicasReady < p.replicasDesired,
  )
  if (hasDegradedControlPlane) {
    return 'degraded'
  }
  return 'healthy'
}

function buildDaprStatus(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprStatusData {
  return {
    health: deriveHealth(controlPlane, components, apps),
    controlPlane,
    components,
    apps,
    buildingBlocks: buildBuildingBlocks(components),
    summary: summarize(controlPlane, components, apps),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchDaprStatus(): Promise<DaprStatusData> {
  const result = await fetchJson<DaprStatusResponse>(DAPR_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch Dapr status')
  }

  const body = result.data
  const controlPlane = Array.isArray(body?.controlPlane) ? body.controlPlane : []
  const components = Array.isArray(body?.components) ? body.components : []
  const apps: DaprAppSidecar = {
    total: body?.apps?.total ?? 0,
    namespaces: body?.apps?.namespaces ?? 0,
  }

  return buildDaprStatus(controlPlane, components, apps)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseCachedDaprResult = CardCachedHookResult<DaprStatusData>

export const useCachedDapr = createCardCachedHook<DaprStatusData>({
  key: CACHE_KEY,
  category: 'services',
  initialData: INITIAL_DATA,
  demoData: DAPR_DEMO_DATA,
  persist: true,
  fetcher: fetchDaprStatus,
  hasAnyData: data => (
    data.health === 'not-installed'
      ? true
      : data.controlPlane.length > 0 || data.components.length > 0
  ),
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  buildDaprStatus,
  buildBuildingBlocks,
  countByType,
}
