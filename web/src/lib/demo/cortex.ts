/**
 * Cortex Status Card — Demo Data & Type Definitions
 *
 * Cortex is a CNCF incubating project: horizontally scalable, highly
 * available, multi-tenant, long-term storage for Prometheus. It runs as
 * a set of microservices — distributor, ingester, querier, store-gateway,
 * ruler, alertmanager — each of which can be independently scaled.
 *
 * Operators care about:
 *   - Control-plane pod health (per component, replica counts)
 *   - Active series ingested (measures tenant load on the ingesters)
 *   - Ingestion rate (samples/sec) vs query rate (queries/sec)
 *   - Tenant count (multi-tenancy fan-out)
 *
 * This is scaffolding — real Cortex integration can be wired into the
 * fetcher in `useCachedCortex` in a follow-up. Until then, cards fall
 * back to this demo data via `useCache`.
 *
 * Source: kubestellar/console-marketplace#35
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CortexPodStatus = 'running' | 'pending' | 'failed' | 'unknown'

/** Canonical Cortex microservice component names. */
export type CortexComponentName =
  | 'distributor'
  | 'ingester'
  | 'querier'
  | 'store-gateway'
  | 'ruler'
  | 'alertmanager'

export type CortexHealth = 'healthy' | 'degraded' | 'not-installed'

export interface CortexComponentPod {
  /** Cortex microservice component this pod belongs to. */
  name: CortexComponentName
  namespace: string
  status: CortexPodStatus
  replicasDesired: number
  replicasReady: number
  cluster: string
}

export interface CortexIngestionMetrics {
  /** Active series currently held in ingester memory across all tenants. */
  activeSeries: number
  /** Samples per second being ingested across all distributors. */
  ingestionRatePerSec: number
  /** Queries per second served by the queriers. */
  queryRatePerSec: number
  /** Distinct tenants (orgs) that have reported at least one active series. */
  tenantCount: number
}

export interface CortexSummary {
  totalPods: number
  runningPods: number
  totalComponents: number
  runningComponents: number
}

export interface CortexStatusData {
  health: CortexHealth
  /** Cortex version string reported by the API (e.g. "1.16.0"). */
  version: string
  components: CortexComponentPod[]
  metrics: CortexIngestionMetrics
  summary: CortexSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_NAMESPACE = 'cortex'
const DEMO_CLUSTER = 'default'
const DEMO_VERSION = '1.16.0'

// Replica counts per component — mirror a realistic mid-sized Cortex
// deployment where distributors and queriers scale out, but singleton
// components (ruler, alertmanager) run with modest replica counts.
const DEMO_DISTRIBUTOR_REPLICAS = 3
const DEMO_INGESTER_REPLICAS = 6
const DEMO_QUERIER_REPLICAS = 4
const DEMO_STORE_GATEWAY_REPLICAS = 3
const DEMO_RULER_REPLICAS = 2
const DEMO_ALERTMANAGER_REPLICAS = 3

// One ingester replica is intentionally degraded in the demo data to
// exercise the warning path in the card UI.
const DEMO_INGESTER_READY = DEMO_INGESTER_REPLICAS - 1

// Ingestion / query metrics chosen to feel realistic for a multi-tenant
// Cortex install handling a few thousand series per tenant.
const DEMO_ACTIVE_SERIES = 4_250_000
const DEMO_INGESTION_RATE_PER_SEC = 125_000
const DEMO_QUERY_RATE_PER_SEC = 420
const DEMO_TENANT_COUNT = 27

// ---------------------------------------------------------------------------
// Demo data — shown when Cortex is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_COMPONENTS: CortexComponentPod[] = [
  {
    name: 'distributor',
    namespace: DEMO_NAMESPACE,
    status: 'running',
    replicasDesired: DEMO_DISTRIBUTOR_REPLICAS,
    replicasReady: DEMO_DISTRIBUTOR_REPLICAS,
    cluster: DEMO_CLUSTER,
  },
  {
    name: 'ingester',
    namespace: DEMO_NAMESPACE,
    status: 'pending',
    replicasDesired: DEMO_INGESTER_REPLICAS,
    replicasReady: DEMO_INGESTER_READY,
    cluster: DEMO_CLUSTER,
  },
  {
    name: 'querier',
    namespace: DEMO_NAMESPACE,
    status: 'running',
    replicasDesired: DEMO_QUERIER_REPLICAS,
    replicasReady: DEMO_QUERIER_REPLICAS,
    cluster: DEMO_CLUSTER,
  },
  {
    name: 'store-gateway',
    namespace: DEMO_NAMESPACE,
    status: 'running',
    replicasDesired: DEMO_STORE_GATEWAY_REPLICAS,
    replicasReady: DEMO_STORE_GATEWAY_REPLICAS,
    cluster: DEMO_CLUSTER,
  },
  {
    name: 'ruler',
    namespace: DEMO_NAMESPACE,
    status: 'running',
    replicasDesired: DEMO_RULER_REPLICAS,
    replicasReady: DEMO_RULER_REPLICAS,
    cluster: DEMO_CLUSTER,
  },
  {
    name: 'alertmanager',
    namespace: DEMO_NAMESPACE,
    status: 'running',
    replicasDesired: DEMO_ALERTMANAGER_REPLICAS,
    replicasReady: DEMO_ALERTMANAGER_REPLICAS,
    cluster: DEMO_CLUSTER,
  },
]

function buildSummary(components: CortexComponentPod[]): CortexSummary {
  const totalPods = components.reduce((sum, c) => sum + c.replicasDesired, 0)
  const runningPods = components.reduce((sum, c) => sum + c.replicasReady, 0)
  const runningComponents = components.filter(
    c => c.status === 'running' && c.replicasReady === c.replicasDesired,
  ).length
  return {
    totalPods,
    runningPods,
    totalComponents: components.length,
    runningComponents,
  }
}

export const CORTEX_DEMO_DATA: CortexStatusData = {
  health: 'degraded',
  version: DEMO_VERSION,
  components: DEMO_COMPONENTS,
  metrics: {
    activeSeries: DEMO_ACTIVE_SERIES,
    ingestionRatePerSec: DEMO_INGESTION_RATE_PER_SEC,
    queryRatePerSec: DEMO_QUERY_RATE_PER_SEC,
    tenantCount: DEMO_TENANT_COUNT,
  },
  summary: buildSummary(DEMO_COMPONENTS),
  lastCheckTime: new Date().toISOString(),
}
