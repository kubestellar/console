/**
 * ArgoCD Data Hooks with real backend API and mock data fallback.
 *
 * These hooks:
 * 1. Try to fetch from the real backend API (/api/gitops/argocd/*)
 * 2. If the API returns real data, use it (isDemoData = false)
 * 3. If the API fails (503, network error, ArgoCD not installed), fall back
 *    to mock data generators (isDemoData = true)
 *
 * Migrated from shadow localStorage cache to useCache infrastructure (issue #14344).
 */

import { useMemo, useState } from 'react'
import { useClusters } from './useMCP'
import { useGlobalFilters } from './useGlobalFilters'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, MOCK_SYNC_DELAY_MS } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import { useCache } from '../lib/cache'

// ============================================================================
// Constants
// ============================================================================

const APPS_CACHE_KEY = 'gitops:argocd:applications'
const HEALTH_CACHE_KEY = 'gitops:argocd:health'
const SYNC_CACHE_KEY = 'gitops:argocd:sync'
const APPSET_CACHE_KEY = 'gitops:argocd:applicationsets'
const EMPTY_ARGO_HEALTH: ArgoHealthData = { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
const EMPTY_ARGO_SYNC: ArgoSyncData = { synced: 0, outOfSync: 0, unknown: 0 }

// ============================================================================
// Types
// ============================================================================

export interface ArgoApplication {
  name: string
  namespace: string
  cluster: string
  syncStatus: 'Synced' | 'OutOfSync' | 'Unknown'
  healthStatus: 'Healthy' | 'Degraded' | 'Progressing' | 'Missing' | 'Unknown'
  source: {
    repoURL: string
    path: string
    targetRevision: string
  }
  lastSynced?: string
}

export interface ArgoHealthData {
  healthy: number
  degraded: number
  progressing: number
  missing: number
  unknown: number
}

export interface ArgoSyncData {
  synced: number
  outOfSync: number
  unknown: number
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
// Mock Data Generators (fallback when ArgoCD is not installed)
// ============================================================================

/**
 * Mock ArgoCD applications for UI demonstration
 *
 * SECURITY: Safe - These are example/placeholder URLs for demo purposes only
 * NOT REAL CREDENTIALS - Example GitHub URLs used for UI demonstration
 */
function getMockArgoApplications(clusters: string[]): ArgoApplication[] {
  const apps: ArgoApplication[] = []

  ;(clusters || []).forEach((cluster) => {
    const baseApps = [
      {
        name: 'frontend-app',
        namespace: 'production',
        syncStatus: 'Synced' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/example-org/frontend-app',
          path: 'k8s/overlays/production',
          targetRevision: 'main' },
        lastSynced: '2 minutes ago' },
      {
        name: 'api-gateway',
        namespace: 'production',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/example-org/api-gateway',
          path: 'deploy',
          targetRevision: 'v2.3.0' },
        lastSynced: '15 minutes ago' },
      {
        name: 'backend-service',
        namespace: 'staging',
        syncStatus: 'Synced' as const,
        healthStatus: 'Progressing' as const,
        source: {
          repoURL: 'https://github.com/example-org/backend-service',
          path: 'manifests',
          targetRevision: 'develop' },
        lastSynced: '1 minute ago' },
      {
        name: 'monitoring-stack',
        namespace: 'monitoring',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Degraded' as const,
        source: {
          repoURL: 'https://github.com/example-org/monitoring-stack',
          path: 'helm/prometheus',
          targetRevision: 'HEAD' },
        lastSynced: '30 minutes ago' },
    ]

    baseApps.forEach((app, idx) => {
      if ((cluster.includes('prod') && idx < 3) ||
          (cluster.includes('staging') && idx > 1) ||
          (!cluster.includes('prod') && !cluster.includes('staging'))) {
        apps.push({ ...app, cluster })
      }
    })
  })

  return apps
}

function getMockHealthData(clusterCount: number): ArgoHealthData {
  const HEALTHY_MULTIPLIER = 3.8
  const DEGRADED_MULTIPLIER = 0.8
  const PROGRESSING_MULTIPLIER = 0.5
  const MISSING_MULTIPLIER = 0.2
  const UNKNOWN_MULTIPLIER = 0.1
  return {
    healthy: Math.floor(clusterCount * HEALTHY_MULTIPLIER),
    degraded: Math.floor(clusterCount * DEGRADED_MULTIPLIER),
    progressing: Math.floor(clusterCount * PROGRESSING_MULTIPLIER),
    missing: Math.floor(clusterCount * MISSING_MULTIPLIER),
    unknown: Math.floor(clusterCount * UNKNOWN_MULTIPLIER) }
}

function getMockSyncStatusData(clusterCount: number): ArgoSyncData {
  const SYNCED_MULTIPLIER = 4.2
  const OUT_OF_SYNC_MULTIPLIER = 1.3
  const UNKNOWN_MULTIPLIER = 0.3
  return {
    synced: Math.floor(clusterCount * SYNCED_MULTIPLIER),
    outOfSync: Math.floor(clusterCount * OUT_OF_SYNC_MULTIPLIER),
    unknown: Math.floor(clusterCount * UNKNOWN_MULTIPLIER) }
}

// ============================================================================
// API Fetch Helpers
// ============================================================================

async function fetchArgoApplications(): Promise<ArgoApplication[]> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/applications', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) throw new Error('Demo data indicator from API')
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    if (data.isDemoData === true) throw new Error('Demo data indicator from API')
    return (data.items || []) as ArgoApplication[]
  } finally {
    clearTimeout(tid)
  }
}

async function fetchArgoHealth(): Promise<ArgoHealthData> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/health', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) throw new Error('Demo data indicator from API')
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    if (data.isDemoData === true) throw new Error('Demo data indicator from API')
    return (data.stats || EMPTY_ARGO_HEALTH) as ArgoHealthData
  } finally {
    clearTimeout(tid)
  }
}

async function fetchArgoSync(): Promise<ArgoSyncData> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/sync', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) throw new Error('Demo data indicator from API')
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    if (data.isDemoData === true) throw new Error('Demo data indicator from API')
    return (data.stats || EMPTY_ARGO_SYNC) as ArgoSyncData
  } finally {
    clearTimeout(tid)
  }
}

/** Trigger an ArgoCD sync via kc-agent.
 *
 * #7993 Phase 4: this used to POST to `/api/gitops/argocd/sync` on the
 * backend. It now POSTs to ``${LOCAL_AGENT_HTTP_URL}/argocd/sync`` so the
 * annotation-patch fallback runs under the user's own kubeconfig instead of
 * the backend pod ServiceAccount. The request body shape is identical.
 */
async function triggerArgoSyncAPI(appName: string, namespace: string, cluster: string): Promise<{ success: boolean; error?: string }> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/argocd/sync`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ appName, namespace, cluster }) })
    const data = await res.json()
    return { success: data.success === true, error: data.error }
  } finally {
    clearTimeout(tid)
  }
}

// ============================================================================
// Helpers
// ============================================================================

function shouldUseImmediateDemoFallback(
  ready: boolean,
  isLoading: boolean,
  isDemoFallback: boolean,
  error: string | null,
): boolean {
  return ready && (isDemoFallback || (!isLoading && error !== null))
}

function shouldUseThresholdDemoFallback(
  ready: boolean,
  isLoading: boolean,
  isDemoFallback: boolean,
  isFailed: boolean,
): boolean {
  return ready && (isDemoFallback || (!isLoading && isFailed))
}

function getFallbackLastRefresh(lastRefresh: number | null, isDemoFallback: boolean): number | null {
  return isDemoFallback ? (lastRefresh ?? Date.now()) : lastRefresh
}

// ============================================================================
// Hook: useArgoCDApplications
// ============================================================================

interface UseArgoCDApplicationsResult {
  applications: ArgoApplication[]
  isDemoFallback: boolean
  isDemoData: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDApplications(): UseArgoCDApplicationsResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  const clusterNames = useMemo(() => (clusters || []).map(c => c.name), [clusters])
  const demoData = useMemo(() => getMockArgoApplications(clusterNames), [clusterNames])
  const ready = !clustersLoading && clusterNames.length > 0

  const result = useCache<ArgoApplication[]>({
    key: APPS_CACHE_KEY,
    category: 'gitops',
    initialData: [],
    persist: true,
    enabled: ready,
    fetcher: fetchArgoApplications,
  })

  const isDemoFallback = shouldUseImmediateDemoFallback(ready, result.isLoading, result.isDemoFallback, result.error)

  return {
    applications: isDemoFallback ? demoData : result.data,
    isDemoFallback,
    isDemoData: isDemoFallback,
    isLoading: clustersLoading ? true : result.isLoading,
    isRefreshing: isDemoFallback ? false : result.isRefreshing,
    error: isDemoFallback ? null : result.error,
    isFailed: isDemoFallback ? false : result.isFailed,
    consecutiveFailures: isDemoFallback ? 0 : result.consecutiveFailures,
    lastRefresh: getFallbackLastRefresh(result.lastRefresh, isDemoFallback),
    refetch: result.refetch,
  }
}

// ============================================================================
// Hook: useArgoCDHealth
// ============================================================================

interface UseArgoCDHealthResult {
  stats: ArgoHealthData
  total: number
  healthyPercent: number
  isDemoFallback: boolean
  isDemoData: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDHealth(): UseArgoCDHealthResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const filteredClusterCount = useMemo(() => {
    if (isAllClustersSelected) return (clusters || []).length
    return (selectedClusters || []).length
  }, [clusters, selectedClusters, isAllClustersSelected])

  const ready = !clustersLoading && filteredClusterCount > 0
  const demoStats = useMemo(() => getMockHealthData(filteredClusterCount), [filteredClusterCount])

  const result = useCache<ArgoHealthData>({
    key: HEALTH_CACHE_KEY,
    category: 'gitops',
    initialData: EMPTY_ARGO_HEALTH,
    persist: true,
    enabled: ready,
    fetcher: fetchArgoHealth,
  })

  const isDemoFallback = shouldUseImmediateDemoFallback(ready, result.isLoading, result.isDemoFallback, result.error)
  const stats = isDemoFallback ? demoStats : result.data
  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const healthyPercent = total > 0 ? (stats.healthy / total) * 100 : 0

  return {
    stats,
    total,
    healthyPercent,
    isDemoFallback,
    isDemoData: isDemoFallback,
    isLoading: clustersLoading ? true : result.isLoading,
    isRefreshing: isDemoFallback ? false : result.isRefreshing,
    error: isDemoFallback ? null : result.error,
    isFailed: isDemoFallback ? false : result.isFailed,
    consecutiveFailures: isDemoFallback ? 0 : result.consecutiveFailures,
    lastRefresh: getFallbackLastRefresh(result.lastRefresh, isDemoFallback),
    refetch: result.refetch,
  }
}

// ============================================================================
// Hook: useArgoCDTriggerSync
// ============================================================================

export interface TriggerSyncResult {
  success: boolean
  /** Raw error message from the API (only set when success is false) */
  error?: string
}

/**
 * Returns a function to trigger an ArgoCD application sync.
 * Tries the real backend API first, falls back to simulated delay in demo mode.
 */
export function useArgoCDTriggerSync() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<TriggerSyncResult | null>(null)

  const triggerSync = async (appName: string, namespace: string, cluster?: string): Promise<TriggerSyncResult> => {
    setIsSyncing(true)
    setLastResult(null)
    try {
      const result = await triggerArgoSyncAPI(appName, namespace, cluster || '')
      setLastResult(result)
      return result
    } catch {
      await new Promise(resolve => setTimeout(resolve, MOCK_SYNC_DELAY_MS))
      const result: TriggerSyncResult = { success: true }
      setLastResult(result)
      return result
    } finally {
      setIsSyncing(false)
    }
  }

  return { triggerSync, isSyncing, lastResult }
}

// ============================================================================
// Hook: useArgoCDSyncStatus
// ============================================================================

interface UseArgoCDSyncStatusResult {
  stats: ArgoSyncData
  total: number
  syncedPercent: number
  outOfSyncPercent: number
  isDemoFallback: boolean
  isDemoData: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDSyncStatus(localClusterFilter: string[] = []): UseArgoCDSyncStatusResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const filteredClusterCount = useMemo(() => {
    let count = isAllClustersSelected ? (clusters || []).length : (selectedClusters || []).length
    if ((localClusterFilter || []).length > 0) {
      count = localClusterFilter.length
    }
    return count
  }, [clusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const ready = !clustersLoading && filteredClusterCount > 0
  const demoStats = useMemo(() => getMockSyncStatusData(filteredClusterCount), [filteredClusterCount])

  const result = useCache<ArgoSyncData>({
    key: SYNC_CACHE_KEY,
    category: 'gitops',
    initialData: EMPTY_ARGO_SYNC,
    persist: true,
    enabled: ready,
    fetcher: fetchArgoSync,
  })

  const isDemoFallback = shouldUseImmediateDemoFallback(ready, result.isLoading, result.isDemoFallback, result.error)
  const stats = isDemoFallback ? demoStats : result.data
  const total = stats.synced + stats.outOfSync + stats.unknown
  const syncedPercent = total > 0 ? (stats.synced / total) * 100 : 0
  const outOfSyncPercent = total > 0 ? (stats.outOfSync / total) * 100 : 0

  return {
    stats,
    total,
    syncedPercent,
    outOfSyncPercent,
    isDemoFallback,
    isDemoData: isDemoFallback,
    isLoading: clustersLoading ? true : result.isLoading,
    isRefreshing: isDemoFallback ? false : result.isRefreshing,
    error: isDemoFallback ? null : result.error,
    isFailed: isDemoFallback ? false : result.isFailed,
    consecutiveFailures: isDemoFallback ? 0 : result.consecutiveFailures,
    lastRefresh: getFallbackLastRefresh(result.lastRefresh, isDemoFallback),
    refetch: result.refetch,
  }
}

// ============================================================================
// Types: ApplicationSets
// ============================================================================

export interface ArgoApplicationSet {
  name: string
  namespace: string
  cluster: string
  generators: string[]
  template: string
  syncPolicy: string
  status: string
  appCount: number
}

// ============================================================================
// API Fetch: ApplicationSets
// ============================================================================

async function fetchArgoApplicationSets(): Promise<ArgoApplicationSet[]> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/applicationsets', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) throw new Error('Demo data indicator from API')
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    if (data.isDemoData === true) throw new Error('Demo data indicator from API')
    return (data.items || []) as ArgoApplicationSet[]
  } finally {
    clearTimeout(tid)
  }
}

// ============================================================================
// Mock Data: ApplicationSets
// ============================================================================

function getMockArgoApplicationSets(clusters: string[]): ArgoApplicationSet[] {
  const appSets: ArgoApplicationSet[] = []

  const templates = [
    {
      name: 'platform-services',
      generators: ['clusters'],
      template: '{{name}}-platform',
      syncPolicy: 'Automated',
      status: 'Healthy',
      appCount: 5 },
    {
      name: 'microservices-fleet',
      generators: ['git'],
      template: '{{path.basename}}',
      syncPolicy: 'Automated',
      status: 'Healthy',
      appCount: 12 },
    {
      name: 'monitoring-stack',
      generators: ['list'],
      template: 'monitoring-{{name}}',
      syncPolicy: 'Manual',
      status: 'Progressing',
      appCount: 3 },
    {
      name: 'multi-region-apps',
      generators: ['matrix'],
      template: '{{cluster}}-{{app}}',
      syncPolicy: 'Automated',
      status: 'Error',
      appCount: 8 },
  ]

  ;(clusters || []).forEach((cluster, idx) => {
    const startIdx = idx % 2 === 0 ? 0 : 2
    const endIdx = startIdx + 2
    templates.slice(startIdx, endIdx).forEach((tmpl) => {
      appSets.push({
        ...tmpl,
        namespace: 'argocd',
        cluster })
    })
  })

  return appSets
}

// ============================================================================
// Hook: useArgoApplicationSets
// ============================================================================

interface UseArgoApplicationSetsResult {
  applicationSets: ArgoApplicationSet[]
  isDemoFallback: boolean
  isDemoData: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoApplicationSets(): UseArgoApplicationSetsResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  const clusterNames = useMemo(() => (clusters || []).map(c => c.name), [clusters])
  const demoData = useMemo(() => getMockArgoApplicationSets(clusterNames), [clusterNames])
  const ready = !clustersLoading && clusterNames.length > 0

  const result = useCache<ArgoApplicationSet[]>({
    key: APPSET_CACHE_KEY,
    category: 'gitops',
    initialData: [],
    persist: true,
    enabled: ready,
    fetcher: fetchArgoApplicationSets,
  })

  const isDemoFallback = shouldUseThresholdDemoFallback(ready, result.isLoading, result.isDemoFallback, result.isFailed)

  return {
    applicationSets: isDemoFallback ? demoData : result.data,
    isDemoFallback,
    isDemoData: isDemoFallback,
    isLoading: clustersLoading ? true : result.isLoading,
    isRefreshing: isDemoFallback ? false : result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: getFallbackLastRefresh(result.lastRefresh, isDemoFallback),
    refetch: result.refetch,
  }
}
