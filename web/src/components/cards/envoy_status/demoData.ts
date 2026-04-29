/**
 * Envoy Proxy Status Card — Demo Data & Type Definitions
 *
 * Models Envoy listeners, clusters (upstream pools), and basic admin stats
 * for the Envoy Proxy (CNCF graduated) edge/service proxy.
 *
 * This is scaffolding — a real Envoy Admin API integration (/listeners,
 * /clusters, /stats) can be wired into `fetchEnvoyStatus` in a follow-up.
 * Until then, cards fall back to this demo data via `useCache`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnvoyListenerStatus = 'active' | 'draining' | 'warming'
export type EnvoyClusterHealth = 'healthy' | 'degraded' | 'unhealthy'
export type EnvoyHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

export interface EnvoyListener {
  name: string
  address: string
  port: number
  status: EnvoyListenerStatus
  cluster: string
}

export interface EnvoyUpstreamCluster {
  name: string
  upstream: string
  endpointsTotal: number
  endpointsHealthy: number
  cluster: string
}

export interface EnvoyStats {
  requestsPerSecond: number
  activeConnections: number
  totalRequests: number
  http5xxRate: number
}

export interface EnvoySummary {
  totalListeners: number
  activeListeners: number
  totalClusters: number
  healthyClusters: number
}

export interface EnvoyStatusData {
  health: EnvoyHealth
  listeners: EnvoyListener[]
  clusters: EnvoyUpstreamCluster[]
  stats: EnvoyStats
  summary: EnvoySummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_REQUESTS_PER_SECOND = 1247
const DEMO_ACTIVE_CONNECTIONS = 384
const DEMO_TOTAL_REQUESTS = 8_942_331
const DEMO_HTTP_5XX_RATE_PCT = 0.14

const PORT_HTTP = 80
const PORT_HTTPS = 443
const PORT_GRPC = 9000

// ---------------------------------------------------------------------------
// Demo data — shown when Envoy is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_LISTENERS: EnvoyListener[] = [
  {
    name: 'listener_http',
    address: '0.0.0.0',
    port: PORT_HTTP,
    status: 'active',
    cluster: 'default',
  },
  {
    name: 'listener_https',
    address: '0.0.0.0',
    port: PORT_HTTPS,
    status: 'active',
    cluster: 'default',
  },
  {
    name: 'listener_grpc',
    address: '0.0.0.0',
    port: PORT_GRPC,
    status: 'warming',
    cluster: 'default',
  },
]

const DEMO_CLUSTERS: EnvoyUpstreamCluster[] = [
  {
    name: 'service_frontend',
    upstream: 'frontend.default.svc:8080',
    endpointsTotal: 6,
    endpointsHealthy: 6,
    cluster: 'default',
  },
  {
    name: 'service_api',
    upstream: 'api.api.svc:8080',
    endpointsTotal: 4,
    endpointsHealthy: 3,
    cluster: 'default',
  },
  {
    name: 'service_auth',
    upstream: 'auth.auth.svc:8080',
    endpointsTotal: 3,
    endpointsHealthy: 3,
    cluster: 'default',
  },
  {
    name: 'service_payments',
    upstream: 'payments.payments.svc:8080',
    endpointsTotal: 2,
    endpointsHealthy: 0,
    cluster: 'default',
  },
]

export const ENVOY_DEMO_DATA: EnvoyStatusData = {
  health: 'degraded',
  listeners: DEMO_LISTENERS,
  clusters: DEMO_CLUSTERS,
  stats: {
    requestsPerSecond: DEMO_REQUESTS_PER_SECOND,
    activeConnections: DEMO_ACTIVE_CONNECTIONS,
    totalRequests: DEMO_TOTAL_REQUESTS,
    http5xxRate: DEMO_HTTP_5XX_RATE_PCT,
  },
  summary: {
    totalListeners: DEMO_LISTENERS.length,
    activeListeners: DEMO_LISTENERS.filter(l => l.status === 'active').length,
    totalClusters: DEMO_CLUSTERS.length,
    healthyClusters: DEMO_CLUSTERS.filter(c => c.endpointsHealthy === c.endpointsTotal).length,
  },
  lastCheckTime: new Date().toISOString(),
}
