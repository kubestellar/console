/**
 * ArgoCD Data Hooks with real backend API and mock data fallback
 *
 * These hooks:
 * 1. Try to fetch from the real backend API (/api/gitops/argocd/*)
 * 2. If the API returns real data, use it (isDemoData = false)
 * 3. If the API fails (503, network error, ArgoCD not installed), fall back
 *    to mock data generators (isDemoData = true)
 * 4. Provide localStorage caching with 5 minute expiry
 * 5. Track consecutive failures for stale-while-revalidate
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { useGlobalFilters } from './useGlobalFilters'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, MOCK_SYNC_DELAY_MS } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'

// Cache expiry time (5 minutes)
const CACHE_EXPIRY_MS = 300_000


// Number of consecutive failures before marking as failed
const FAILURE_THRESHOLD = 3

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

interface CachedData<T> {
  data: T
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

function loadFromCache<T>(key: string): CachedData<T> | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored) as CachedData<T>
      // Check if cache is still valid (within expiry time)
      if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveToCache<T>(key: string, data: T, isDemoData: boolean): void {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
      isDemoData }))
  } catch {
    // Ignore storage errors (quota, etc.)
  }
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
          repoURL: 'https://github.com/example-org/frontend-app', // EXAMPLE URL - not a real repository
          path: 'k8s/overlays/production',
          targetRevision: 'main' },
        lastSynced: '2 minutes ago' },
      {
        name: 'api-gateway',
        namespace: 'production',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/example-org/api-gateway', // EXAMPLE URL - not a real repository
          path: 'deploy',
          targetRevision: 'v2.3.0' },
        lastSynced: '15 minutes ago' },
      {
        name: 'backend-service',
        namespace: 'staging',
        syncStatus: 'Synced' as const,
        healthStatus: 'Progressing' as const,
        source: {
          repoURL: 'https://github.com/example-org/backend-service', // EXAMPLE URL - not a real repository
          path: 'manifests',
          targetRevision: 'develop' },
        lastSynced: '1 minute ago' },
      {
        name: 'monitoring-stack',
        namespace: 'monitoring',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Degraded' as const,
        source: {
          repoURL: 'https://github.com/example-org/monitoring-stack', // EXAMPLE URL - not a real repository
          path: 'helm/prometheus',
          targetRevision: 'HEAD' },
        lastSynced: '30 minutes ago' },
    ]

    baseApps.forEach((app, idx) => {
      // Only add some apps to some clusters
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

/** Fetch ArgoCD applications from backend API */
async function fetchArgoApplications(): Promise<{ items: ArgoApplication[]; isDemoData: boolean }> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/applications', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) {
        return { items: [], isDemoData: true }
      }
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    return {
      items: (data.items || []) as ArgoApplication[],
      isDemoData: data.isDemoData === true }
  } finally {
    clearTimeout(tid)
  }
}

/** Fetch ArgoCD health summary from backend API */
async function fetchArgoHealth(): Promise<{ stats: ArgoHealthData; isDemoData: boolean }> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/health', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) {
        return { stats: { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }, isDemoData: true }
      }
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    return {
      stats: (data.stats || { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }) as ArgoHealthData,
      isDemoData: data.isDemoData === true }
  } finally {
    clearTimeout(tid)
  }
}

/** Fetch ArgoCD sync summary from backend API */
async function fetchArgoSync(): Promise<{ stats: ArgoSyncData; isDemoData: boolean }> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/sync', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) {
        return { stats: { synced: 0, outOfSync: 0, unknown: 0 }, isDemoData: true }
      }
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    return {
      stats: (data.stats || { synced: 0, outOfSync: 0, unknown: 0 }) as ArgoSyncData,
      isDemoData: data.isDemoData === true }
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
// Hook: useArgoCDApplications
// ============================================================================

const APPS_CACHE_KEY = 'kc-argocd-apps-cache'

interface UseArgoCDApplicationsResult {
  applications: ArgoApplication[]
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

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache<ArgoApplication[]>(APPS_CACHE_KEY))
  const cachedSnapshot = cachedData.current
  const [applications, setApplications] = useState<ArgoApplication[]>(
    cachedSnapshot?.data || []
  )
  const [isDemoData, setIsDemoData] = useState(cachedSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedSnapshot?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedSnapshot)

  const clusterNames = useMemo(() => (clusters || []).map(c => c.name), [clusters])

  const refetch = useCallback(async (silent = false) => {
    if (clusterNames.length === 0) {
      setIsLoading(false)
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    try {
      // Try real API first
      const result = await fetchArgoApplications()

      if (!result.isDemoData) {
        // Real data from ArgoCD — use it even if empty (ArgoCD installed
        // but no applications deployed yet).  Previously an empty list
        // was treated as "no ArgoCD" which triggered mock fallback (#4201).
        setApplications(result.items || [])
        setIsDemoData(false)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        initialLoadDone.current = true
        saveToCache(APPS_CACHE_KEY, result.items || [], false)
        return
      }

      // API explicitly indicated demo data — fall through to mock
      throw new Error('No ArgoCD data available')
    } catch {
      // API failed or returned demo indicator — fall back to mock data
      const apps = getMockArgoApplications(clusterNames)
      setApplications(apps)
      setIsDemoData(true)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(APPS_CACHE_KEY, apps, true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clusterNames])

  // Initial load
  useEffect(() => {
    if (!clustersLoading && clusterNames.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, clusterNames.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (applications.length === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [applications.length, refetch])

  return {
    applications,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false) }
}

// ============================================================================
// Hook: useArgoCDHealth
// ============================================================================

const HEALTH_CACHE_KEY = 'kc-argocd-health-cache'

interface UseArgoCDHealthResult {
  stats: ArgoHealthData
  total: number
  healthyPercent: number
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

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache<ArgoHealthData>(HEALTH_CACHE_KEY))
  const cachedHealthSnapshot = cachedData.current
  const [stats, setStats] = useState<ArgoHealthData>(
    cachedHealthSnapshot?.data || { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
  )
  const [isDemoData, setIsDemoData] = useState(cachedHealthSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedHealthSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedHealthSnapshot?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedHealthSnapshot)

  const filteredClusterCount = useMemo(() => {
    if (isAllClustersSelected) return (clusters || []).length
    return (selectedClusters || []).length
  }, [clusters, selectedClusters, isAllClustersSelected])

  const refetch = useCallback(async (silent = false) => {
    if (filteredClusterCount === 0) {
      setIsLoading(false)
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    try {
      // Try real API first
      const result = await fetchArgoHealth()

      if (!result.isDemoData) {
        // Real data from ArgoCD — use it even if totals are zero
        // (ArgoCD installed but no applications yet).  Previously a
        // zero total was treated as "no ArgoCD" which triggered mock
        // fallback even when ArgoCD was running (#4201).
        setStats(result.stats)
        setIsDemoData(false)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        initialLoadDone.current = true
        saveToCache(HEALTH_CACHE_KEY, result.stats, false)
        return
      }

      // No real data — fall through to mock
      throw new Error('No ArgoCD health data available')
    } catch {
      // Fall back to mock data
      const healthData = getMockHealthData(filteredClusterCount)
      setStats(healthData)
      setIsDemoData(true)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(HEALTH_CACHE_KEY, healthData, true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [filteredClusterCount])

  // Initial load
  useEffect(() => {
    if (!clustersLoading && filteredClusterCount > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, filteredClusterCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    if (total === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [stats, refetch])

  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const healthyPercent = total > 0 ? (stats.healthy / total) * 100 : 0

  return {
    stats,
    total,
    healthyPercent,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false) }
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
      // Try real backend API first
      const result = await triggerArgoSyncAPI(appName, namespace, cluster || '')
      setLastResult(result)
      return result
    } catch {
      // API unreachable — simulate for demo mode
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

const SYNC_CACHE_KEY = 'kc-argocd-sync-cache'

interface UseArgoCDSyncStatusResult {
  stats: ArgoSyncData
  total: number
  syncedPercent: number
  outOfSyncPercent: number
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

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache<ArgoSyncData>(SYNC_CACHE_KEY))
  const cachedSyncSnapshot = cachedData.current
  const [stats, setStats] = useState<ArgoSyncData>(
    cachedSyncSnapshot?.data || { synced: 0, outOfSync: 0, unknown: 0 }
  )
  const [isDemoData, setIsDemoData] = useState(cachedSyncSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedSyncSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedSyncSnapshot?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedSyncSnapshot)

  const filteredClusterCount = useMemo(() => {
    let count = isAllClustersSelected ? (clusters || []).length : (selectedClusters || []).length
    // Apply local cluster filter
    if ((localClusterFilter || []).length > 0) {
      count = localClusterFilter.length
    }
    return count
  }, [clusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const refetch = useCallback(async (silent = false) => {
    if (filteredClusterCount === 0) {
      setIsLoading(false)
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    try {
      // Try real API first
      const result = await fetchArgoSync()

      if (!result.isDemoData) {
        // Real data from ArgoCD — use it even if totals are zero (#4201).
        setStats(result.stats)
        setIsDemoData(false)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        initialLoadDone.current = true
        saveToCache(SYNC_CACHE_KEY, result.stats, false)
        return
      }

      // No real data — fall through to mock
      throw new Error('No ArgoCD sync data available')
    } catch {
      // Fall back to mock data
      const syncData = getMockSyncStatusData(filteredClusterCount)
      setStats(syncData)
      setIsDemoData(true)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(SYNC_CACHE_KEY, syncData, true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [filteredClusterCount])

  // Initial load
  useEffect(() => {
    if (!clustersLoading && filteredClusterCount > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, filteredClusterCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    const total = stats.synced + stats.outOfSync + stats.unknown
    if (total === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [stats, refetch])

  const total = stats.synced + stats.outOfSync + stats.unknown
  const syncedPercent = total > 0 ? (stats.synced / total) * 100 : 0
  const outOfSyncPercent = total > 0 ? (stats.outOfSync / total) * 100 : 0

  return {
    stats,
    total,
    syncedPercent,
    outOfSyncPercent,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false) }
}

// ============================================================================
// Types: ApplicationSets
// ============================================================================

export interface ArgoApplicationSet {
  name: string
  namespace: string
  cluster: string
  generators: string[]  // e.g. ["list", "cluster", "git", "matrix"]
  template: string      // Template application name
  syncPolicy: string    // "Automated", "Manual", or ""
  status: string        // "Healthy", "Progressing", "Error", "Unknown"
  appCount: number      // Number of applications generated
}

// ============================================================================
// API Fetch: ApplicationSets
// ============================================================================

async function fetchArgoApplicationSets(): Promise<{ items: ArgoApplicationSet[]; isDemoData: boolean }> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), FETCH_DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/gitops/argocd/applicationsets', {
      signal: ctrl.signal,
      headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.isDemoData) {
        return { items: [], isDemoData: true }
      }
      throw new Error(`API ${res.status}: ${body.error || res.statusText}`)
    }
    const data = await res.json()
    return {
      items: (data.items || []) as ArgoApplicationSet[],
      isDemoData: data.isDemoData === true }
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
    // Distribute templates across clusters
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

const APPSET_CACHE_KEY = 'kc-argocd-appsets-cache'

interface UseArgoApplicationSetsResult {
  applicationSets: ArgoApplicationSet[]
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

  // Initialize from cache — snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache<ArgoApplicationSet[]>(APPSET_CACHE_KEY))
  const cachedAppSetSnapshot = cachedData.current
  const [applicationSets, setApplicationSets] = useState<ArgoApplicationSet[]>(
    cachedAppSetSnapshot?.data || []
  )
  const [isDemoData, setIsDemoData] = useState(cachedAppSetSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedAppSetSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedAppSetSnapshot?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedAppSetSnapshot)

  const clusterNames = useMemo(() => (clusters || []).map(c => c.name), [clusters])

  const refetch = useCallback(async (silent = false) => {
    if (clusterNames.length === 0) {
      setIsLoading(false)
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    try {
      // Try real API first
      const result = await fetchArgoApplicationSets()

      if (!result.isDemoData) {
        setApplicationSets(result.items || [])
        setIsDemoData(false)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        initialLoadDone.current = true
        saveToCache(APPSET_CACHE_KEY, result.items || [], false)
        return
      }

      // API explicitly indicated demo data — fall through to mock
      throw new Error('No ArgoCD ApplicationSet data available')
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch ApplicationSets'
      console.error('[ArgoCD] ApplicationSets fetch failed:', errorMsg)
      setError(errorMsg)
      setConsecutiveFailures(prev => prev + 1)
      // Only fall back to demo data if this is likely "not installed" (not a transient error)
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        const appSets = getMockArgoApplicationSets(clusterNames)
        setApplicationSets(appSets)
        setIsDemoData(true)
      }
      setLastRefresh(Date.now())
      initialLoadDone.current = true
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clusterNames, consecutiveFailures])

  // Initial load
  useEffect(() => {
    if (!clustersLoading && clusterNames.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, clusterNames.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (applicationSets.length === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [applicationSets.length, refetch])

  return {
    applicationSets,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false) }
}
