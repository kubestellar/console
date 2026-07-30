/**
 * Demo data for the OpenYurt edge computing status card.
 *
 * Represents a typical edge-cloud topology managed by OpenYurt with
 * node pools, edge node autonomy, and Raven gateway connectivity.
 * Used in demo mode or when no Kubernetes clusters are connected.
 *
 * OpenYurt terminology:
 * - NodePool: logical grouping of nodes (edge or cloud)
 * - Autonomy: edge nodes can operate independently when disconnected
 * - Raven Gateway: cross-pool network tunnel for edge-cloud connectivity
 */

const DEMO_LAST_CHECK_OFFSET_MS = 45_000 // Demo data shows as checked 45 seconds ago

export type NodePoolType = 'edge' | 'cloud'

export type NodePoolStatus = 'ready' | 'degraded' | 'not-ready'

export type GatewayStatus = 'connected' | 'disconnected' | 'pending'

export interface OpenYurtNodePool {
  name: string
  type: NodePoolType
  status: NodePoolStatus
  /** Total number of nodes in the pool */
  nodeCount: number
  /** Number of nodes reporting Ready condition */
  readyNodes: number
  /** Whether autonomy is enabled for this pool */
  autonomyEnabled: boolean
}

export interface OpenYurtGateway {
  name: string
  /** The node pool this gateway serves */
  nodePool: string
  status: GatewayStatus
  /** Endpoint address (IP or hostname) */
  endpoint: string
}

export interface OpenYurtDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  controllerPods: {
    ready: number
    total: number
  }
  nodePools: OpenYurtNodePool[]
  gateways: OpenYurtGateway[]
  totalNodes: number
  autonomousNodes: number
  lastCheckTime: string
}

export const OPENYURT_DEMO_DATA: OpenYurtDemoData = {
  health: 'degraded',
  controllerPods: { ready: 2, total: 3 },
  nodePools: [
    {
      name: 'cloud-pool',
      type: 'cloud',
      status: 'ready',
      nodeCount: 3,
      readyNodes: 3,
      autonomyEnabled: false,
    },
    {
      name: 'edge-beijing-1',
      type: 'edge',
      status: 'ready',
      nodeCount: 5,
      readyNodes: 5,
      autonomyEnabled: true,
    },
    {
      name: 'edge-shanghai-2',
      type: 'edge',
      status: 'degraded',
      nodeCount: 4,
      readyNodes: 3,
      autonomyEnabled: true,
    },
    {
      name: 'edge-shenzhen-3',
      type: 'edge',
      status: 'ready',
      nodeCount: 6,
      readyNodes: 6,
      autonomyEnabled: true,
    },
    {
      name: 'edge-hangzhou-4',
      type: 'edge',
      status: 'not-ready',
      nodeCount: 2,
      readyNodes: 0,
      autonomyEnabled: true,
    },
  ],
  gateways: [
    {
      name: 'gw-beijing-1',
      nodePool: 'edge-beijing-1',
      status: 'connected',
      endpoint: '10.0.1.100',
    },
    {
      name: 'gw-shanghai-2',
      nodePool: 'edge-shanghai-2',
      status: 'connected',
      endpoint: '10.0.2.100',
    },
    {
      name: 'gw-shenzhen-3',
      nodePool: 'edge-shenzhen-3',
      status: 'connected',
      endpoint: '10.0.3.100',
    },
    {
      name: 'gw-hangzhou-4',
      nodePool: 'edge-hangzhou-4',
      status: 'disconnected',
      endpoint: '10.0.4.100',
    },
  ],
  totalNodes: 20,
  autonomousNodes: 17,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
