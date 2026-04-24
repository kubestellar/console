/**
 * Linkerd Service Mesh Status Card — Demo Data & Type Definitions
 *
 * Models Linkerd meshed pods (per-deployment) with success rate, RPS, and
 * p99 latency — the golden signals surfaced by `linkerd viz stat`.
 *
 * This is scaffolding — a real integration with the Linkerd Viz extension
 * (`/api/tap` / Prometheus) can be wired into `fetchLinkerdStatus` in a
 * follow-up. Until then, cards fall back to this demo data via `useCache`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkerdPodStatus = 'meshed' | 'partial' | 'unmeshed'
export type LinkerdHealth = 'healthy' | 'degraded' | 'not-installed'

export interface LinkerdMeshedDeployment {
  namespace: string
  deployment: string
  meshedPods: number
  totalPods: number
  successRatePct: number
  requestsPerSecond: number
  p99LatencyMs: number
  status: LinkerdPodStatus
  cluster: string
}

export interface LinkerdStats {
  totalRps: number
  avgSuccessRatePct: number
  avgP99LatencyMs: number
  controlPlaneVersion: string
}

export interface LinkerdSummary {
  totalDeployments: number
  fullyMeshedDeployments: number
  totalMeshedPods: number
  totalPods: number
}

export interface LinkerdStatusData {
  health: LinkerdHealth
  deployments: LinkerdMeshedDeployment[]
  stats: LinkerdStats
  summary: LinkerdSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_TOTAL_RPS = 842
const DEMO_AVG_SUCCESS_RATE_PCT = 99.42
const DEMO_AVG_P99_LATENCY_MS = 18
const DEMO_CONTROL_PLANE_VERSION = 'stable-2.14.10'

// Per-deployment demo metrics
const FRONTEND_POD_COUNT = 4
const FRONTEND_RPS = 312
const FRONTEND_SUCCESS_PCT = 99.87
const FRONTEND_P99_MS = 14

const API_POD_COUNT = 6
const API_RPS = 287
const API_SUCCESS_PCT = 99.63
const API_P99_MS = 22

const AUTH_POD_COUNT = 3
const AUTH_RPS = 148
const AUTH_SUCCESS_PCT = 100.0
const AUTH_P99_MS = 9

const PAYMENTS_TOTAL_PODS = 4
const PAYMENTS_MESHED_PODS = 3
const PAYMENTS_RPS = 62
const PAYMENTS_SUCCESS_PCT = 97.41
const PAYMENTS_P99_MS = 41

const EMAIL_POD_COUNT = 2
const EMAIL_RPS = 33
const EMAIL_SUCCESS_PCT = 99.94
const EMAIL_P99_MS = 11

// ---------------------------------------------------------------------------
// Demo data — shown when Linkerd is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_DEPLOYMENTS: LinkerdMeshedDeployment[] = [
  {
    namespace: 'frontend',
    deployment: 'web',
    meshedPods: FRONTEND_POD_COUNT,
    totalPods: FRONTEND_POD_COUNT,
    successRatePct: FRONTEND_SUCCESS_PCT,
    requestsPerSecond: FRONTEND_RPS,
    p99LatencyMs: FRONTEND_P99_MS,
    status: 'meshed',
    cluster: 'default',
  },
  {
    namespace: 'api',
    deployment: 'api-gateway',
    meshedPods: API_POD_COUNT,
    totalPods: API_POD_COUNT,
    successRatePct: API_SUCCESS_PCT,
    requestsPerSecond: API_RPS,
    p99LatencyMs: API_P99_MS,
    status: 'meshed',
    cluster: 'default',
  },
  {
    namespace: 'auth',
    deployment: 'auth-service',
    meshedPods: AUTH_POD_COUNT,
    totalPods: AUTH_POD_COUNT,
    successRatePct: AUTH_SUCCESS_PCT,
    requestsPerSecond: AUTH_RPS,
    p99LatencyMs: AUTH_P99_MS,
    status: 'meshed',
    cluster: 'default',
  },
  {
    namespace: 'payments',
    deployment: 'payments-api',
    meshedPods: PAYMENTS_MESHED_PODS,
    totalPods: PAYMENTS_TOTAL_PODS,
    successRatePct: PAYMENTS_SUCCESS_PCT,
    requestsPerSecond: PAYMENTS_RPS,
    p99LatencyMs: PAYMENTS_P99_MS,
    status: 'partial',
    cluster: 'default',
  },
  {
    namespace: 'notifications',
    deployment: 'email-sender',
    meshedPods: EMAIL_POD_COUNT,
    totalPods: EMAIL_POD_COUNT,
    successRatePct: EMAIL_SUCCESS_PCT,
    requestsPerSecond: EMAIL_RPS,
    p99LatencyMs: EMAIL_P99_MS,
    status: 'meshed',
    cluster: 'default',
  },
]

export const LINKERD_DEMO_DATA: LinkerdStatusData = {
  health: 'degraded',
  deployments: DEMO_DEPLOYMENTS,
  stats: {
    totalRps: DEMO_TOTAL_RPS,
    avgSuccessRatePct: DEMO_AVG_SUCCESS_RATE_PCT,
    avgP99LatencyMs: DEMO_AVG_P99_LATENCY_MS,
    controlPlaneVersion: DEMO_CONTROL_PLANE_VERSION,
  },
  summary: {
    totalDeployments: DEMO_DEPLOYMENTS.length,
    fullyMeshedDeployments: DEMO_DEPLOYMENTS.filter(d => d.status === 'meshed').length,
    totalMeshedPods: DEMO_DEPLOYMENTS.reduce((sum, d) => sum + d.meshedPods, 0),
    totalPods: DEMO_DEPLOYMENTS.reduce((sum, d) => sum + d.totalPods, 0),
  },
  lastCheckTime: new Date().toISOString(),
}
