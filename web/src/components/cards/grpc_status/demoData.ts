/**
 * gRPC Service Status Card — Demo Data & Type Definitions
 *
 * Models gRPC services (as seen via gRPC Reflection or server-side
 * /healthz endpoints), per-service RPS, and p99 latency for the
 * gRPC (CNCF graduated) high-performance RPC framework.
 *
 * This is scaffolding — a real gRPC Reflection / Channelz integration
 * can be wired into `fetchGrpcStatus` in a follow-up. Until then, cards
 * fall back to this demo data via `useCache`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrpcServingStatus = 'serving' | 'not-serving' | 'unknown'
export type GrpcHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

export interface GrpcService {
  name: string
  namespace: string
  endpoints: number
  rps: number
  latencyP99Ms: number
  errorRatePct: number
  status: GrpcServingStatus
  cluster: string
}

export interface GrpcStats {
  totalRps: number
  avgLatencyP99Ms: number
  avgErrorRatePct: number
  reflectionEnabled: number
}

export interface GrpcSummary {
  totalServices: number
  servingServices: number
  totalEndpoints: number
}

export interface GrpcStatusData {
  health: GrpcHealth
  services: GrpcService[]
  stats: GrpcStats
  summary: GrpcSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_TOTAL_RPS = 2184
const DEMO_AVG_LATENCY_P99_MS = 48
const DEMO_AVG_ERROR_RATE_PCT = 0.42
const DEMO_REFLECTION_ENABLED = 4

const FRONTEND_RPS = 812
const FRONTEND_P99_MS = 22
const FRONTEND_ERR_PCT = 0.05
const FRONTEND_ENDPOINTS = 6

const PAYMENTS_RPS = 340
const PAYMENTS_P99_MS = 96
const PAYMENTS_ERR_PCT = 1.4
const PAYMENTS_ENDPOINTS = 3

const INVENTORY_RPS = 612
const INVENTORY_P99_MS = 31
const INVENTORY_ERR_PCT = 0.11
const INVENTORY_ENDPOINTS = 4

const AUTH_RPS = 408
const AUTH_P99_MS = 42
const AUTH_ERR_PCT = 0.18
const AUTH_ENDPOINTS = 3

const NOTIFICATIONS_RPS = 12
const NOTIFICATIONS_P99_MS = 180
const NOTIFICATIONS_ERR_PCT = 0.0
const NOTIFICATIONS_ENDPOINTS = 2

// ---------------------------------------------------------------------------
// Demo data — shown when gRPC services are not detected or in demo mode
// ---------------------------------------------------------------------------

const DEMO_SERVICES: GrpcService[] = [
  {
    name: 'frontend.FrontendService',
    namespace: 'frontend',
    endpoints: FRONTEND_ENDPOINTS,
    rps: FRONTEND_RPS,
    latencyP99Ms: FRONTEND_P99_MS,
    errorRatePct: FRONTEND_ERR_PCT,
    status: 'serving',
    cluster: 'default',
  },
  {
    name: 'payments.PaymentService',
    namespace: 'payments',
    endpoints: PAYMENTS_ENDPOINTS,
    rps: PAYMENTS_RPS,
    latencyP99Ms: PAYMENTS_P99_MS,
    errorRatePct: PAYMENTS_ERR_PCT,
    status: 'serving',
    cluster: 'default',
  },
  {
    name: 'inventory.InventoryService',
    namespace: 'inventory',
    endpoints: INVENTORY_ENDPOINTS,
    rps: INVENTORY_RPS,
    latencyP99Ms: INVENTORY_P99_MS,
    errorRatePct: INVENTORY_ERR_PCT,
    status: 'serving',
    cluster: 'default',
  },
  {
    name: 'auth.AuthService',
    namespace: 'auth',
    endpoints: AUTH_ENDPOINTS,
    rps: AUTH_RPS,
    latencyP99Ms: AUTH_P99_MS,
    errorRatePct: AUTH_ERR_PCT,
    status: 'serving',
    cluster: 'default',
  },
  {
    name: 'notifications.NotifyService',
    namespace: 'notifications',
    endpoints: NOTIFICATIONS_ENDPOINTS,
    rps: NOTIFICATIONS_RPS,
    latencyP99Ms: NOTIFICATIONS_P99_MS,
    errorRatePct: NOTIFICATIONS_ERR_PCT,
    status: 'not-serving',
    cluster: 'default',
  },
]

export const GRPC_DEMO_DATA: GrpcStatusData = {
  health: 'degraded',
  services: DEMO_SERVICES,
  stats: {
    totalRps: DEMO_TOTAL_RPS,
    avgLatencyP99Ms: DEMO_AVG_LATENCY_P99_MS,
    avgErrorRatePct: DEMO_AVG_ERROR_RATE_PCT,
    reflectionEnabled: DEMO_REFLECTION_ENABLED,
  },
  summary: {
    totalServices: DEMO_SERVICES.length,
    servingServices: DEMO_SERVICES.filter(s => s.status === 'serving').length,
    totalEndpoints: DEMO_SERVICES.reduce((sum, s) => sum + s.endpoints, 0),
  },
  lastCheckTime: new Date().toISOString(),
}
