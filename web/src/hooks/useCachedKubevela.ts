/**
 * KubeVela Status Hook — Data fetching for the kubevela_status card.
 *
 * Uses createCardCachedHook factory for zero-boilerplate caching.
 * Domain logic (parsing, health derivation) remains in pure helper functions.
 *
 * Source: kubestellar/console-marketplace#43
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { fetchJson } from '../lib/fetchJson'
import {
  KUBEVELA_DEMO_DATA,
  type KubeVelaApplication,
  type KubeVelaAppStatus,
  type KubeVelaControllerPod,
  type KubeVelaStats,
  type KubeVelaStatusData,
  type KubeVelaSummary,
} from '../components/cards/kubevela_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kubevela-status'
const KUBEVELA_STATUS_ENDPOINT = '/api/kubevela/status'
const DEFAULT_CONTROLLER_VERSION = 'unknown'

const EMPTY_STATS: KubeVelaStats = {
  totalApplications: 0,
  runningApplications: 0,
  failedApplications: 0,
  totalComponents: 0,
  totalTraits: 0,
  controllerVersion: DEFAULT_CONTROLLER_VERSION,
}

const EMPTY_SUMMARY: KubeVelaSummary = {
  totalApplications: 0,
  runningApplications: 0,
  failedApplications: 0,
  totalControllerPods: 0,
  runningControllerPods: 0,
}

const INITIAL_DATA: KubeVelaStatusData = {
  health: 'not-installed',
  applications: [],
  controllerPods: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/kubevela/status response)
// ---------------------------------------------------------------------------

interface KubeVelaStatusResponse {
  applications?: KubeVelaApplication[]
  controllerPods?: KubeVelaControllerPod[]
  stats?: Partial<KubeVelaStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const FAILED_STATUSES: readonly KubeVelaAppStatus[] = [
  'workflowFailed',
  'unhealthy',
]

function countApps(
  applications: KubeVelaApplication[],
  predicate: (app: KubeVelaApplication) => boolean,
): number {
  return applications.filter(predicate).length
}

function countPods(
  pods: KubeVelaControllerPod[],
  predicate: (pod: KubeVelaControllerPod) => boolean,
): number {
  return pods.filter(predicate).length
}

function summarize(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
): KubeVelaSummary {
  return {
    totalApplications: applications.length,
    runningApplications: countApps(applications, a => a.status === 'running'),
    failedApplications: countApps(applications, a =>
      FAILED_STATUSES.includes(a.status),
    ),
    totalControllerPods: controllerPods.length,
    runningControllerPods: countPods(controllerPods, p => p.status === 'running'),
  }
}

function deriveHealth(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
): KubeVelaStatusData['health'] {
  if (applications.length === 0 && controllerPods.length === 0) {
    return 'not-installed'
  }
  const hasDegradedController = controllerPods.some(
    p => p.status !== 'running' || p.replicasReady < p.replicasDesired,
  )
  const hasFailedApp = applications.some(a =>
    FAILED_STATUSES.includes(a.status),
  )
  if (hasDegradedController || hasFailedApp) {
    return 'degraded'
  }
  return 'healthy'
}

function buildStats(
  applications: KubeVelaApplication[],
  controllerVersion: string,
): KubeVelaStats {
  return {
    totalApplications: applications.length,
    runningApplications: countApps(applications, a => a.status === 'running'),
    failedApplications: countApps(applications, a =>
      FAILED_STATUSES.includes(a.status),
    ),
    totalComponents: applications.reduce((sum, a) => sum + a.componentCount, 0),
    totalTraits: applications.reduce((sum, a) => sum + a.traitCount, 0),
    controllerVersion,
  }
}

function buildKubeVelaStatus(
  applications: KubeVelaApplication[],
  controllerPods: KubeVelaControllerPod[],
  controllerVersion: string,
): KubeVelaStatusData {
  return {
    health: deriveHealth(applications, controllerPods),
    applications,
    controllerPods,
    stats: buildStats(applications, controllerVersion),
    summary: summarize(applications, controllerPods),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchKubeVelaStatus(): Promise<KubeVelaStatusData> {
  const result = await fetchJson<KubeVelaStatusResponse>(KUBEVELA_STATUS_ENDPOINT)

  if (result.failed) {
    throw new Error('Unable to fetch KubeVela status')
  }

  const body = result.data
  const applications = Array.isArray(body?.applications) ? body.applications : []
  const controllerPods = Array.isArray(body?.controllerPods)
    ? body.controllerPods
    : []
  const controllerVersion =
    body?.stats?.controllerVersion ?? DEFAULT_CONTROLLER_VERSION

  return buildKubeVelaStatus(applications, controllerPods, controllerVersion)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCachedKubevela = createCardCachedHook<KubeVelaStatusData>({
  key: CACHE_KEY,
  category: 'deployments',
  initialData: INITIAL_DATA,
  demoData: KUBEVELA_DEMO_DATA,
  fetcher: fetchKubeVelaStatus,
  hasAnyData: (data) =>
    data.health === 'not-installed'
      ? true
      : (data.applications ?? []).length > 0 ||
        (data.controllerPods ?? []).length > 0,
})

export type UseCachedKubevelaResult = CardCachedHookResult<KubeVelaStatusData>

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  countApps,
  countPods,
  summarize,
  deriveHealth,
  buildStats,
  buildKubeVelaStatus,
  FAILED_STATUSES,
}
