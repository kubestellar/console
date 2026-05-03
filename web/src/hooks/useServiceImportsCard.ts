/**
 * ServiceImports Card Data Hook with real backend API and demo data fallback
 *
 * Fetches live MCS ServiceImport data from GET /api/mcs/imports.
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
import type { ServiceImport, ServiceImportList } from '../types/mcs'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { MS_PER_DAY, MS_PER_HOUR } from '../lib/constants/time'

// ============================================================================
// Constants
// ============================================================================

/** Cache expiry time — 5 minutes */
const CACHE_EXPIRY_MS = 300_000

/** Auto-refresh interval — 2 minutes */

/** Number of consecutive failures before marking as failed */
const FAILURE_THRESHOLD = 3

/** localStorage key for ServiceImports cache */
const CACHE_KEY = 'kc-service-imports-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Types
// ============================================================================

interface CachedData {
  data: ServiceImport[]
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

function saveToCache(data: ServiceImport[], isDemoData: boolean): void {
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


function getDemoServiceImports(clusterNames: string[]): ServiceImport[] {
  const imports: ServiceImport[] = []
  const names = clusterNames.length > 0 ? clusterNames : ['us-east-1', 'us-west-2', 'eu-central-1']

  const templates: Array<{
    name: string
    namespace: string
    type: 'ClusterSetIP' | 'Headless'
    endpoints: number
  }> = [
    { name: 'api-gateway', namespace: 'production', type: 'ClusterSetIP', endpoints: 3 },
    { name: 'auth-service', namespace: 'production', type: 'ClusterSetIP', endpoints: 2 },
    { name: 'cache-redis', namespace: 'infrastructure', type: 'Headless', endpoints: 1 },
    { name: 'metrics-collector', namespace: 'monitoring', type: 'ClusterSetIP', endpoints: 4 },
    { name: 'database-proxy', namespace: 'data', type: 'ClusterSetIP', endpoints: 0 },
  ]

  for (const cluster of (names || [])) {
    const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const count = 1 + (hash % 3) // 1-3 imports per cluster
    const others = names.filter(n => n !== cluster)

    for (let i = 0; i < count && i < templates.length; i++) {
      const tmpl = templates[i]
      const sourceCluster = others.length > 0 ? others[hash % others.length] : 'unknown'
      imports.push({
        name: tmpl.name,
        namespace: tmpl.namespace,
        cluster,
        sourceCluster,
        type: tmpl.type,
        dnsName: `${tmpl.name}.${tmpl.namespace}.svc.clusterset.local`,
        ports: [{ name: tmpl.name, protocol: 'TCP', port: 8080 + i }],
        endpoints: tmpl.endpoints,
        createdAt: new Date(Date.now() - (i + 1) * MS_PER_DAY - hash * MS_PER_HOUR).toISOString(),
      })
    }
  }

  return imports
}

// ============================================================================
// Hook: useServiceImportsCard
// ============================================================================

export interface UseServiceImportsCardResult {
  imports: ServiceImport[]
  isDemoData: boolean
  isLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useServiceImportsCard(): UseServiceImportsCardResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [imports, setImports] = useState<ServiceImport[]>(cachedSnapshot?.data || [])
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
      const res = await fetch('/api/mcs/imports', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as ServiceImportList

      // An empty array is a legitimate result (no ServiceImports configured)
      const items = data.items || []

      setImports(items)
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(items, false)
    } catch {
      // API failed — fall back to demo data
      const clusterNames = (clusters || []).filter(c => c.reachable !== false).map(c => c.name)
      const demoImports = getDemoServiceImports(clusterNames)
      setImports(demoImports)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoImports, true)
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
    imports,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
