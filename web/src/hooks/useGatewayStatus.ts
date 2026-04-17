/**
 * Gateway Status Data Hook with real backend API and demo data fallback
 *
 * Fetches live Gateway API data from GET /api/gateway/gateways.
 * Falls back to demo data when the API returns 503 (no k8s client)
 * or on network error.
 *
 * Provides:
 * - localStorage cache load/save with 5 minute expiry
 * - isDemoData flag for CardWrapper demo badge
 * - Auto-refresh every 2 minutes
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from './useMCP'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

// ============================================================================
// Constants
// ============================================================================

/** Cache expiry time — 5 minutes */
const CACHE_EXPIRY_MS = 300_000

/** Auto-refresh interval — 2 minutes */
const REFRESH_INTERVAL_MS = 120_000

/** Number of consecutive failures before marking as failed */
const FAILURE_THRESHOLD = 3

/** localStorage key for Gateway status cache */
const CACHE_KEY = 'kc-gateway-status-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Types
// ============================================================================

type GatewayStatusType = 'Programmed' | 'Accepted' | 'Pending' | 'NotAccepted' | 'Unknown'

interface Listener {
  name: string
  protocol: string
  port: number
  hostname?: string
  attachedRoutes: number
}

export interface Gateway {
  name: string
  namespace: string
  cluster: string
  gatewayClass: string
  status: GatewayStatusType
  addresses: string[]
  listeners: Listener[]
  attachedRoutes: number
  createdAt: string
}

interface GatewayListResponse {
  items: Gateway[]
  totalCount: number
}

interface CachedData {
  data: Gateway[]
  timestamp: number
  isDemoData: boolean
}

// ============================================================================
// Auth Helper
// ============================================================================

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ============================================================================
// Cache Helpers
// ============================================================================

function loadFromCache(): CachedData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CachedData
      if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveToCache(data: Gateway[], isDemoData: boolean): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
      isDemoData,
    }))
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

// ============================================================================
// Demo Data Generator
// ============================================================================

/** Days in milliseconds */
const MS_PER_DAY = 86_400_000
/** Hours in milliseconds */
const MS_PER_HOUR = 3_600_000

function getDemoGateways(clusterNames: string[]): Gateway[] {
  const gateways: Gateway[] = []
  const names = clusterNames.length > 0 ? clusterNames : ['us-east-1', 'us-west-2', 'eu-central-1']

  const templates: Array<{
    name: string
    namespace: string
    gatewayClass: string
    status: GatewayStatusType
    listeners: Listener[]
  }> = [
    {
      name: 'prod-gateway',
      namespace: 'gateway-system',
      gatewayClass: 'istio',
      status: 'Programmed',
      listeners: [
        { name: 'http', protocol: 'HTTP', port: 80, attachedRoutes: 5 },
        { name: 'https', protocol: 'HTTPS', port: 443, hostname: '*.example.com', attachedRoutes: 8 },
      ],
    },
    {
      name: 'api-gateway',
      namespace: 'api',
      gatewayClass: 'envoy-gateway',
      status: 'Programmed',
      listeners: [
        { name: 'api', protocol: 'HTTP', port: 8080, attachedRoutes: 12 },
      ],
    },
    {
      name: 'internal-gateway',
      namespace: 'internal',
      gatewayClass: 'contour',
      status: 'Accepted',
      listeners: [
        { name: 'grpc', protocol: 'HTTPS', port: 443, attachedRoutes: 3 },
      ],
    },
    {
      name: 'staging-gateway',
      namespace: 'staging',
      gatewayClass: 'nginx',
      status: 'Pending',
      listeners: [
        { name: 'http', protocol: 'HTTP', port: 80, attachedRoutes: 0 },
      ],
    },
    {
      name: 'legacy-gateway',
      namespace: 'legacy',
      gatewayClass: 'traefik',
      status: 'NotAccepted',
      listeners: [],
    },
  ]

  for (const cluster of (names || [])) {
    const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const count = 1 + (hash % 3) // 1-3 gateways per cluster

    for (let i = 0; i < count && i < templates.length; i++) {
      const tmpl = templates[i]
      const totalRoutes = (tmpl.listeners || []).reduce((sum, l) => sum + l.attachedRoutes, 0)
      gateways.push({
        name: tmpl.name,
        namespace: tmpl.namespace,
        cluster,
        gatewayClass: tmpl.gatewayClass,
        status: tmpl.status,
        addresses: tmpl.status === 'Programmed' ? [`10.${hash % 256}.0.${i + 1}`] : [],
        listeners: tmpl.listeners,
        attachedRoutes: totalRoutes,
        createdAt: new Date(Date.now() - (i + 1) * MS_PER_DAY - hash * MS_PER_HOUR).toISOString(),
      })
    }
  }

  return gateways
}

// ============================================================================
// Hook: useGatewayStatus
// ============================================================================

export interface UseGatewayStatusResult {
  gateways: Gateway[]
  isDemoData: boolean
  isLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useGatewayStatus(): UseGatewayStatusResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [gateways, setGateways] = useState<Gateway[]>(cachedSnapshot?.data || [])
  const [isDemoData, setIsDemoData] = useState(cachedSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedSnapshot?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedSnapshot)

  const refetch = useCallback(async (silent = false) => {
    if (!silent && !initialLoadDone.current) {
      setIsLoading(true)
    }

    try {
      const res = await fetch('/api/gateway/gateways', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as GatewayListResponse

      // An empty array is a legitimate result (no Gateways configured)
      const items = (data.items || []).map(gw => ({
        ...gw,
        // Normalize createdAt to ISO string (backend sends time.Time)
        createdAt: typeof gw.createdAt === 'string' ? gw.createdAt : new Date(gw.createdAt).toISOString(),
      }))

      setGateways(items)
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(items, false)
    } catch {
      // API failed — fall back to demo data
      const clusterNames = (clusters || []).filter(c => c.reachable !== false).map(c => c.name)
      const demoGateways = getDemoGateways(clusterNames)
      setGateways(demoGateways)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoGateways, true)
    } finally {
      setIsLoading(false)
    }
  }, [clusters])

  // Initial load
  useEffect(() => {
    if (!clustersLoading) {
      refetch()
    }
  }, [clustersLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (!initialLoadDone.current) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [refetch])

  return {
    gateways,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
