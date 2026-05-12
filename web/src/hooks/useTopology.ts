/**
 * Topology Data Hook with localStorage caching and failure tracking
 *
 * Fetches live service topology data from GET /api/topology.
 * Falls back to demo data when the API returns 503 (no k8s client)
 * or on network error.
 *
 * Provides:
 * - localStorage cache load/save with 5 minute expiry
 * - consecutiveFailures state for tracking fetch issues
 * - isFailed computed value (true when 3+ consecutive failures)
 * - Auto-refresh every 2 minutes
 * - isDemoData flag for CardWrapper demo badge
 */

import { useRef } from 'react'
import { useCache } from '../lib/cache'
import { STORAGE_KEY_TOKEN, DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import type {
  TopologyResponse,
  TopologyGraph,
  TopologyClusterSummary,
  TopologyNode,
  TopologyEdge,
} from '../types/topology'

// ============================================================================
// Constants
// ============================================================================

/** Cache expiry time — 5 minutes */
const CACHE_EXPIRY_MS = 300_000

/** Auto-refresh interval — 2 minutes */

/** localStorage key for topology cache */
const TOPOLOGY_CACHE_KEY = 'kc-topology-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Demo fallback data
// ============================================================================

const DEMO_NODES: TopologyNode[] = [
  // Clusters
  { id: 'cluster:us-east-1', type: 'cluster', label: 'us-east-1', cluster: 'us-east-1', health: 'healthy' },
  { id: 'cluster:us-west-2', type: 'cluster', label: 'us-west-2', cluster: 'us-west-2', health: 'healthy' },
  { id: 'cluster:eu-central-1', type: 'cluster', label: 'eu-central-1', cluster: 'eu-central-1', health: 'healthy' },
  // Services in us-east-1
  { id: 'service:us-east-1:production:api-gateway', type: 'service', label: 'api-gateway', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { exported: true, endpoints: 3 } },
  { id: 'service:us-east-1:production:auth-service', type: 'service', label: 'auth-service', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { exported: true, endpoints: 2 } },
  { id: 'service:us-east-1:production:user-service', type: 'service', label: 'user-service', cluster: 'us-east-1', namespace: 'production', health: 'healthy', metadata: { endpoints: 4 } },
  // Services in us-west-2
  { id: 'service:us-west-2:production:api-gateway', type: 'service', label: 'api-gateway', cluster: 'us-west-2', namespace: 'production', health: 'healthy', metadata: { imported: true, sourceCluster: 'us-east-1' } },
  { id: 'service:us-west-2:infrastructure:cache-redis', type: 'service', label: 'cache-redis', cluster: 'us-west-2', namespace: 'infrastructure', health: 'healthy', metadata: { exported: true, endpoints: 1 } },
  // Services in eu-central-1
  { id: 'service:eu-central-1:production:auth-service', type: 'service', label: 'auth-service', cluster: 'eu-central-1', namespace: 'production', health: 'healthy', metadata: { imported: true, sourceCluster: 'us-east-1' } },
  { id: 'service:eu-central-1:production:payment-processor', type: 'service', label: 'payment-processor', cluster: 'eu-central-1', namespace: 'production', health: 'degraded', metadata: { endpoints: 0 } },
  // Gateways
  { id: 'gateway:us-east-1:gateway-system:prod-gateway', type: 'gateway', label: 'prod-gateway', cluster: 'us-east-1', namespace: 'gateway-system', health: 'healthy', metadata: { gatewayClass: 'istio', addresses: ['34.102.136.180'] } },
  { id: 'gateway:us-west-2:gateway-system:api-gateway', type: 'gateway', label: 'api-gateway', cluster: 'us-west-2', namespace: 'gateway-system', health: 'healthy', metadata: { gatewayClass: 'envoy-gateway', addresses: ['10.0.0.50'] } },
]

const DEMO_EDGES: TopologyEdge[] = [
  // MCS cross-cluster connections
  { id: 'mcs:api-gateway:east-west', source: 'service:us-east-1:production:api-gateway', target: 'service:us-west-2:production:api-gateway', type: 'mcs-export', label: 'MCS', health: 'healthy', animated: true },
  { id: 'mcs:auth:east-eu', source: 'service:us-east-1:production:auth-service', target: 'service:eu-central-1:production:auth-service', type: 'mcs-export', label: 'MCS', health: 'healthy', animated: true },
  // Internal connections
  { id: 'internal:api-user:east', source: 'service:us-east-1:production:api-gateway', target: 'service:us-east-1:production:user-service', type: 'internal', health: 'healthy', animated: false },
  { id: 'internal:api-auth:east', source: 'service:us-east-1:production:api-gateway', target: 'service:us-east-1:production:auth-service', type: 'internal', health: 'healthy', animated: false },
  // Gateway routes
  { id: 'route:prod-gateway:api', source: 'gateway:us-east-1:gateway-system:prod-gateway', target: 'service:us-east-1:production:api-gateway', type: 'http-route', label: 'HTTPRoute', health: 'healthy', animated: true },
  { id: 'route:api-gateway:west', source: 'gateway:us-west-2:gateway-system:api-gateway', target: 'service:us-west-2:production:api-gateway', type: 'http-route', label: 'HTTPRoute', health: 'healthy', animated: true },
]

const DEMO_GRAPH: TopologyGraph = {
  nodes: DEMO_NODES,
  edges: DEMO_EDGES,
  clusters: ['us-east-1', 'us-west-2', 'eu-central-1'],
  lastUpdated: 0,
}

const DEMO_CLUSTERS: TopologyClusterSummary[] = [
  { name: 'us-east-1', nodeCount: 5, serviceCount: 3, gatewayCount: 1, exportCount: 2, importCount: 0, health: 'healthy' },
  { name: 'us-west-2', nodeCount: 3, serviceCount: 2, gatewayCount: 1, exportCount: 1, importCount: 1, health: 'healthy' },
  { name: 'eu-central-1', nodeCount: 2, serviceCount: 2, gatewayCount: 0, exportCount: 0, importCount: 1, health: 'healthy' },
]

const DEMO_STATS: TopologyResponse['stats'] = {
  totalNodes: 12,
  totalEdges: 8,
  healthyConnections: 7,
  degradedConnections: 1,
}

const DEMO_RESPONSE: TopologyResponse = {
  graph: DEMO_GRAPH,
  clusters: DEMO_CLUSTERS,
  stats: DEMO_STATS,
}

// ============================================================================
// Cache Helpers
// ============================================================================

interface CachedData<T> {
  data: T
  timestamp: number
}

function loadFromCache<T>(key: string): CachedData<T> | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored) as CachedData<T>
      if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }))
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

// ============================================================================
// Auth Helper
// ============================================================================

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================================================
// Hook: useTopology
// ============================================================================

export interface UseTopologyResult {
  graph: TopologyGraph | null
  clusters: TopologyClusterSummary[]
  stats: TopologyResponse['stats'] | null
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  consecutiveFailures: number
  isDemoData: boolean
  lastRefresh: number | null
  refetch: () => Promise<void>
}

interface TopologyData {
  graph: TopologyGraph | null
  clusters: TopologyClusterSummary[]
  stats: TopologyResponse['stats'] | null
  isDemoData: boolean
}

function normalizeTopologyData(data: TopologyResponse, isDemoData = false): TopologyData {
  return {
    graph: data?.graph || null,
    clusters: data?.clusters || [],
    stats: data?.stats || null,
    isDemoData,
  }
}

async function fetchTopology(): Promise<TopologyData> {
  const res = await fetch('/api/topology', {
    headers: authHeaders(),
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (res.status === STATUS_SERVICE_UNAVAILABLE) {
    console.warn('[useTopology] Backend returned 503, using demo data')
    return normalizeTopologyData(DEMO_RESPONSE, true)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const data = (await res.json()) as TopologyResponse
  saveToCache(TOPOLOGY_CACHE_KEY, data)
  return normalizeTopologyData(data)
}

export function useTopology(): UseTopologyResult {
  const cachedDataRef = useRef(loadFromCache<TopologyResponse>(TOPOLOGY_CACHE_KEY))
  const cachedSnapshot = cachedDataRef.current
  const cachedTopology = cachedSnapshot ? normalizeTopologyData(cachedSnapshot.data) : null

  const result = useCache<TopologyData | null>({
    key: 'topology',
    initialData: cachedTopology,
    refreshInterval: REFRESH_INTERVAL_MS,
    fetcher: fetchTopology,
    persist: false,
  })

  const shouldShowDemoFallback = result.data === null && result.error !== null
  const displayData = shouldShowDemoFallback ? normalizeTopologyData(DEMO_RESPONSE, true) : result.data

  return {
    graph: displayData?.graph || null,
    clusters: displayData?.clusters || [],
    stats: displayData?.stats || null,
    isLoading: result.data === null ? (shouldShowDemoFallback ? false : result.isLoading) : false,
    isRefreshing: result.isRefreshing,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    isDemoData: displayData?.isDemoData ?? false,
    lastRefresh: result.lastRefresh ?? cachedSnapshot?.timestamp ?? null,
    refetch: result.refetch,
  }
}
