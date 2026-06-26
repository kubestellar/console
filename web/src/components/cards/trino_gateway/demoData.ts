/**
 * Demo data and type definitions for the Trino Gateway Monitor card.
 *
 * Discovers Trino coordinator/worker pods and Trino Gateway pods across
 * all clusters and aggregates gateway routing status.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrinoClusterInfo {
  name: string
  cluster: string
  namespace: string
  coordinatorReady: boolean
  workerCount: number
  activeQueries: number
  queuedQueries: number
}

export type TrinoGatewayStatus = 'healthy' | 'degraded' | 'down'

export interface TrinoGatewayBackend {
  name: string
  cluster: string
  active: boolean
  draining: boolean
}

export interface TrinoGatewayInfo {
  name: string
  cluster: string
  namespace: string
  status: TrinoGatewayStatus
  backends: TrinoGatewayBackend[]
}

export interface TrinoGatewayData {
  detected: boolean
  trinoClusters: TrinoClusterInfo[]
  gateways: TrinoGatewayInfo[]
  totalWorkers: number
  totalActiveQueries: number
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_LAST_CHECK_AGE_MS = 30_000
const DEMO_TOTAL_WORKERS = 12
const DEMO_TOTAL_ACTIVE_QUERIES = 47

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

export const TRINO_GATEWAY_DEMO_DATA: TrinoGatewayData = {
  detected: true,
  trinoClusters: [
    {
      name: 'trino-prod-us',
      cluster: 'us-east-prod',
      namespace: 'trino',
      coordinatorReady: true,
      workerCount: 8,
      activeQueries: 32,
      queuedQueries: 5,
    },
    {
      name: 'trino-prod-eu',
      cluster: 'eu-west-prod',
      namespace: 'trino',
      coordinatorReady: true,
      workerCount: 4,
      activeQueries: 15,
      queuedQueries: 2,
    },
  ],
  gateways: [
    {
      name: 'trino-gateway',
      cluster: 'us-east-prod',
      namespace: 'trino',
      status: 'healthy',
      backends: [
        { name: 'trino-prod-us', cluster: 'us-east-prod', active: true, draining: false },
        { name: 'trino-prod-eu', cluster: 'eu-west-prod', active: true, draining: false },
      ],
    },
  ],
  totalWorkers: DEMO_TOTAL_WORKERS,
  totalActiveQueries: DEMO_TOTAL_ACTIVE_QUERIES,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGE_MS).toISOString(),
}
