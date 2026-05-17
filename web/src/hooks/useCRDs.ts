/**
 * CRD Data Hook with real backend API and demo data fallback.
 *
 * Fetches live CRD data from GET /api/crds.
 * Falls back to demo data when the API returns 503 (no k8s client)
 * or on network error.
 *
 * Migrated from shadow localStorage cache to useCache infrastructure (issue #14344).
 */

import { useMemo } from 'react'
import { useClusters } from './useMCP'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { createCachedHook } from '../lib/cache'

// ============================================================================
// Constants
// ============================================================================

const CRD_CACHE_KEY = 'crds'
const STATUS_SERVICE_UNAVAILABLE = 503
const DEFAULT_DEMO_CLUSTERS = ['us-east-1', 'us-west-2', 'eu-central-1'] as const

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
// Fetcher
// ============================================================================

async function fetchCRDs(): Promise<CRDData[]> {
  const res = await fetch('/api/crds', {
    headers: authHeaders(),
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (res.status === STATUS_SERVICE_UNAVAILABLE) {
    throw new Error('Service unavailable')
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }

  const data = (await res.json()) as CRDListResponse
  if (data.isDemoData) {
    throw new Error('Backend returned demo data indicator')
  }

  return data.crds || []
}

// ============================================================================
// Hook: useCRDs
// ============================================================================

export interface UseCRDsResult {
  crds: CRDData[]
  isDemoFallback: boolean
  isDemoData: boolean
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useCRDs(): UseCRDsResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  const clusterNames = useMemo(
    () => (clusters || []).filter(c => c.reachable !== false).map(c => c.name),
    [clusters],
  )
  const demoData = useMemo(
    () => getDemoCRDs(clusterNames.length > 0 ? clusterNames : [...DEFAULT_DEMO_CLUSTERS]),
    [clusterNames],
  )

  const useCachedCRDs = createCachedHook<CRDData[]>({
    key: CRD_CACHE_KEY,
    category: 'operators',
    initialData: [],
    persist: true,
    enabled: !clustersLoading,
    fetcher: fetchCRDs,
  })
  const result = useCachedCRDs()

  const isDemoFallback = !clustersLoading && (result.isDemoFallback || (!result.isLoading && result.error !== null))

  return {
    crds: isDemoFallback ? demoData : result.data,
    isDemoFallback,
    isDemoData: isDemoFallback,
    isLoading: clustersLoading ? true : result.isLoading,
    isRefreshing: isDemoFallback ? false : result.isRefreshing,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: isDemoFallback ? (result.lastRefresh ?? Date.now()) : result.lastRefresh,
    refetch: result.refetch,
  }
}
