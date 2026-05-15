/**
 * KServe Status Hook — Data fetching for the kserve_status card.
 *
 * Uses createCardCachedHook factory for zero-boilerplate caching.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 *
 * Source: kubestellar/console-marketplace#38
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  KSERVE_DEMO_DATA,
  type KServeControllerPods,
  type KServeHealth,
  type KServeService,
  type KServeServiceStatus,
  type KServeStatusData,
  type KServeSummary,
} from '../lib/demo/kserve'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kserve-status'
const KSERVE_STATUS_ENDPOINT = '/api/kserve/status'
const PERCENT_ROUND_MULTIPLIER = 10

const EMPTY_CONTROLLER_PODS: KServeControllerPods = {
  ready: 0,
  total: 0,
}

const EMPTY_SUMMARY: KServeSummary = {
  totalServices: 0,
  readyServices: 0,
  notReadyServices: 0,
  totalRequestsPerSecond: 0,
  avgP95LatencyMs: 0,
}

const INITIAL_DATA: KServeStatusData = {
  health: 'not-installed',
  controllerPods: EMPTY_CONTROLLER_PODS,
  services: [],
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/kserve/status response)
// ---------------------------------------------------------------------------

interface KServeStatusResponse {
  controllerPods?: Partial<KServeControllerPods>
  services?: KServeService[]
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function countByStatus(
  services: KServeService[],
  status: KServeServiceStatus,
): number {
  return (services ?? []).filter(s => s.status === status).length
}

function summarize(services: KServeService[]): KServeSummary {
  const safeServices = services ?? []
  const totalRps = safeServices.reduce(
    (sum, s) => sum + (Number.isFinite(s.requestsPerSecond) ? s.requestsPerSecond : 0),
    0,
  )
  const totalLatency = safeServices.reduce(
    (sum, s) => sum + (Number.isFinite(s.p95LatencyMs) ? s.p95LatencyMs : 0),
    0,
  )
  const avgLatency =
    safeServices.length > 0 ? Math.round(totalLatency / safeServices.length) : 0
  return {
    totalServices: safeServices.length,
    readyServices: countByStatus(safeServices, 'ready'),
    notReadyServices: countByStatus(safeServices, 'not-ready'),
    totalRequestsPerSecond:
      Math.round(totalRps * PERCENT_ROUND_MULTIPLIER) / PERCENT_ROUND_MULTIPLIER,
    avgP95LatencyMs: avgLatency,
  }
}

function deriveHealth(
  controllerPods: KServeControllerPods,
  services: KServeService[],
): KServeHealth {
  if (controllerPods.total === 0 && (services ?? []).length === 0) {
    return 'not-installed'
  }
  const controllerDegraded = controllerPods.ready < controllerPods.total
  const serviceDegraded = (services ?? []).some(s => s.status !== 'ready')
  if (controllerDegraded || serviceDegraded) {
    return 'degraded'
  }
  return 'healthy'
}

function buildKserveStatus(
  controllerPods: KServeControllerPods,
  services: KServeService[],
): KServeStatusData {
  const safeServices = services ?? []
  return {
    health: deriveHealth(controllerPods, safeServices),
    controllerPods,
    services: safeServices,
    summary: summarize(safeServices),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchKserveStatus(): Promise<KServeStatusData> {
  const result = await fetchJson<KServeStatusResponse>(KSERVE_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch KServe status')
  }

  const body = result.data
  const controllerPods: KServeControllerPods = {
    ready: body?.controllerPods?.ready ?? 0,
    total: body?.controllerPods?.total ?? 0,
  }
  const services = Array.isArray(body?.services) ? body.services : []

  return buildKserveStatus(controllerPods, services)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedKserve = createCardCachedHook<KServeStatusData>({
  key: CACHE_KEY,
  category: 'ai-ml',
  initialData: INITIAL_DATA,
  demoData: KSERVE_DEMO_DATA,
  fetcher: fetchKserveStatus,
  hasAnyData: (data) =>
    data.health === 'not-installed'
      ? true
      : (data.services ?? []).length > 0 || data.controllerPods.total > 0,
})

export type UseCachedKserveResult = CardCachedHookResult<KServeStatusData>

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  countByStatus,
  summarize,
  deriveHealth,
  buildKserveStatus,
}
