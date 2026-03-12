/**
 * ServiceExport Data Hook with real backend API and demo data fallback
 *
 * Fetches live MCS ServiceExport data from GET /api/service-exports.
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
import type { ServiceExport } from '../types/mcs'

// ============================================================================
// Constants
// ============================================================================

/** Cache expiry time — 5 minutes */
const CACHE_EXPIRY_MS = 300_000

/** Auto-refresh interval — 2 minutes */
const REFRESH_INTERVAL_MS = 120_000

/** Number of consecutive failures before marking as failed */
const FAILURE_THRESHOLD = 3

/** localStorage key for ServiceExport cache */
const CACHE_KEY = 'kc-service-exports-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Types
// ============================================================================

interface ServiceExportListResponse {
  exports: ServiceExport[]
  isDemoData: boolean
}

interface CachedData {
  data: ServiceExport[]
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

function saveToCache(data: ServiceExport[], isDemoData: boolean): void {
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

function getDemoServiceExports(clusterNames: string[]): ServiceExport[] {
  const exports: ServiceExport[] = []
  const names = clusterNames.length > 0 ? clusterNames : ['us-east-1', 'us-west-2', 'eu-central-1']

  // Generate realistic ServiceExports
  const templates = [
    { name: 'api-gateway', namespace: 'production', status: 'Ready' as const },
    { name: 'auth-service', namespace: 'production', status: 'Ready' as const },
    { name: 'cache-redis', namespace: 'infrastructure', status: 'Ready' as const },
    { name: 'payment-processor', namespace: 'payments', status: 'Pending' as const, message: 'Waiting for endpoints to become ready' },
    { name: 'legacy-backend', namespace: 'legacy', status: 'Failed' as const, message: 'Service not found in cluster' },
  ]

  for (const cluster of names) {
    const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const count = 2 + (hash % 4) // 2-5 exports per cluster
    const others = names.filter(n => n !== cluster)

    for (let i = 0; i < count && i < templates.length; i++) {
      const tmpl = templates[i]
      exports.push({
        name: tmpl.name,
        namespace: tmpl.namespace,
        cluster,
        serviceName: tmpl.name,
        status: tmpl.status,
        message: tmpl.message,
        targetClusters: others.slice(0, 1 + (hash % others.length)),
        createdAt: new Date(Date.now() - (i + 1) * MS_PER_DAY - hash * MS_PER_HOUR).toISOString(),
      })
    }
  }

  return exports
}

// ============================================================================
// Hook: useServiceExports
// ============================================================================

export interface UseServiceExportsResult {
  exports: ServiceExport[]
  isDemoData: boolean
  isLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useServiceExports(): UseServiceExportsResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache
  const cachedData = useRef(loadFromCache())
  const [exports, setExports] = useState<ServiceExport[]>(cachedData.current?.data || [])
  const [isDemoData, setIsDemoData] = useState(cachedData.current?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedData.current?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const refetch = useCallback(async (silent = false) => {
    if (!silent && !initialLoadDone.current) {
      setIsLoading(true)
    }

    try {
      const res = await fetch('/api/service-exports', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as ServiceExportListResponse

      if (data.isDemoData || (data.exports || []).length === 0) {
        // API returned but no real data — fall through to demo
        throw new Error('No ServiceExport data available')
      }

      setExports(data.exports || [])
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(data.exports || [], false)
    } catch {
      // API failed or returned demo indicator — fall back to demo data
      const clusterNames = (clusters || []).filter(c => c.reachable !== false).map(c => c.name)
      const demoExports = getDemoServiceExports(clusterNames)
      setExports(demoExports)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoExports, true)
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
    exports,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
