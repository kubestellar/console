/**
 * CRD Data Hook with real backend API and demo data fallback
 *
 * Fetches live CRD data from GET /api/crds.
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

/** localStorage key for CRD cache */
const CRD_CACHE_KEY = 'kc-crd-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Types
// ============================================================================

export interface CRDData {
  name: string
  group: string
  version: string
  scope: 'Namespaced' | 'Cluster'
  status: 'Established' | 'NotEstablished' | 'Terminating'
  instances: number
  cluster: string
  versions?: Array<{
    name: string
    served: boolean
    storage: boolean
  }>
}

interface CRDListResponse {
  crds: CRDData[]
  isDemoData: boolean
}

interface CachedData {
  data: CRDData[]
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
    const stored = localStorage.getItem(CRD_CACHE_KEY)
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

function saveToCache(data: CRDData[], isDemoData: boolean): void {
  try {
    localStorage.setItem(CRD_CACHE_KEY, JSON.stringify({
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

function getDemoCRDs(clusterNames: string[]): CRDData[] {
  const crds: CRDData[] = []

  ;(clusterNames || []).forEach((clusterName) => {
    const hash = clusterName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const CRD_MIN_COUNT = 5
    const CRD_RANGE = 6

    const baseCRDs: CRDData[] = [
      { name: 'certificates', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 20 + (hash % 30), cluster: clusterName },
      { name: 'clusterissuers', group: 'cert-manager.io', version: 'v1', scope: 'Cluster', status: 'Established', instances: 1 + (hash % 3), cluster: clusterName },
      { name: 'issuers', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: hash % 7 === 0 ? 'NotEstablished' : 'Established', instances: hash % 7 === 0 ? 0 : 5 + (hash % 10), cluster: clusterName },
      { name: 'prometheuses', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 1 + (hash % 5), cluster: clusterName },
      { name: 'servicemonitors', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 50 + (hash % 100), cluster: clusterName },
      { name: 'alertmanagers', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: hash % 5 === 0 ? 'Terminating' : 'Established', instances: 1 + (hash % 3), cluster: clusterName },
      { name: 'kafkas', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: 'Established', instances: 2 + (hash % 5), cluster: clusterName },
      { name: 'kafkatopics', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: hash % 4 === 0 ? 'NotEstablished' : 'Established', instances: hash % 4 === 0 ? 0 : 10 + (hash % 20), cluster: clusterName },
      { name: 'applications', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 20 + (hash % 50), cluster: clusterName },
      { name: 'appprojects', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 2 + (hash % 5), cluster: clusterName },
    ]

    const crdCount = CRD_MIN_COUNT + (hash % CRD_RANGE)
    crds.push(...baseCRDs.slice(0, crdCount))
  })

  return crds
}

// ============================================================================
// Hook: useCRDs
// ============================================================================

export interface UseCRDsResult {
  crds: CRDData[]
  isDemoData: boolean
  isLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useCRDs(): UseCRDsResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache
  const cachedData = useRef(loadFromCache())
  const [crds, setCRDs] = useState<CRDData[]>(cachedData.current?.data || [])
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
      const res = await fetch('/api/crds', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        // Backend has no k8s client — response includes isDemoData: true
        // Fall through to demo data
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as CRDListResponse

      if (data.isDemoData || (data.crds || []).length === 0) {
        // API returned but no real data — fall through to demo
        throw new Error('No CRD data available')
      }

      setCRDs(data.crds || [])
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(data.crds || [], false)
    } catch {
      // API failed or returned demo indicator — fall back to demo data
      const clusterNames = (clusters || []).filter(c => c.reachable !== false).map(c => c.name)
      const demoCRDs = getDemoCRDs(clusterNames.length > 0 ? clusterNames : ['us-east-1', 'us-west-2', 'eu-central-1'])
      setCRDs(demoCRDs)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoCRDs, true)
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
    crds,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
