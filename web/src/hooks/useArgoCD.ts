/**
 * ArgoCD Data Hooks with localStorage caching and failure tracking
 *
 * These hooks provide:
 * - localStorage cache load/save with 5 minute expiry
 * - consecutiveFailures state for tracking fetch issues
 * - isFailed computed value (true when 3+ consecutive failures)
 * - isRefreshing state for stale-while-revalidate pattern
 * - State initialization from cache on mount
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { useGlobalFilters } from './useGlobalFilters'
import { useDemoMode } from './useDemoMode'

// Cache expiry time (5 minutes)
const CACHE_EXPIRY_MS = 300000

// Refresh interval (2 minutes)
const REFRESH_INTERVAL_MS = 120000

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
// Mock Data Generators
// ============================================================================

/**
 * Mock ArgoCD applications for UI demonstration
 * NOTE: These are example URLs only. In production, ArgoCD applications
 * would be fetched from the ArgoCD API.
 */
function getMockArgoApplications(clusters: string[]): ArgoApplication[] {
  const apps: ArgoApplication[] = []

  clusters.forEach((cluster) => {
    const baseApps = [
      {
        name: 'frontend-app',
        namespace: 'production',
        syncStatus: 'Synced' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/example-org/frontend-app',
          path: 'k8s/overlays/production',
          targetRevision: 'main',
        },
        lastSynced: '2 minutes ago',
      },
      {
        name: 'api-gateway',
        namespace: 'production',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/example-org/api-gateway',
          path: 'deploy',
          targetRevision: 'v2.3.0',
        },
        lastSynced: '15 minutes ago',
      },
      {
        name: 'backend-service',
        namespace: 'staging',
        syncStatus: 'Synced' as const,
        healthStatus: 'Progressing' as const,
        source: {
          repoURL: 'https://github.com/example-org/backend-service',
          path: 'manifests',
          targetRevision: 'develop',
        },
        lastSynced: '1 minute ago',
      },
      {
        name: 'monitoring-stack',
        namespace: 'monitoring',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Degraded' as const,
        source: {
          repoURL: 'https://github.com/example-org/monitoring-stack',
          path: 'helm/prometheus',
          targetRevision: 'HEAD',
        },
        lastSynced: '30 minutes ago',
      },
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
  return {
    healthy: Math.floor(clusterCount * 3.8),
    degraded: Math.floor(clusterCount * 0.8),
    progressing: Math.floor(clusterCount * 0.5),
    missing: Math.floor(clusterCount * 0.2),
    unknown: Math.floor(clusterCount * 0.1),
  }
}

function getMockSyncStatusData(clusterCount: number): ArgoSyncData {
  return {
    synced: Math.floor(clusterCount * 4.2),
    outOfSync: Math.floor(clusterCount * 1.3),
    unknown: Math.floor(clusterCount * 0.3),
  }
}

// ============================================================================
// Hook: useArgoCDApplications
// ============================================================================

const APPS_CACHE_KEY = 'kc-argocd-apps-cache'

interface UseArgoCDApplicationsResult {
  applications: ArgoApplication[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDApplications(): UseArgoCDApplicationsResult {
  const { isDemoMode: demoMode } = useDemoMode()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache
  const cachedData = useRef(loadFromCache<ArgoApplication[]>(APPS_CACHE_KEY))
  const [applications, setApplications] = useState<ArgoApplication[]>(
    cachedData.current?.data || []
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedData.current?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const clusterNames = useMemo(
    () => clusters.map(c => c.name),
    [clusters]
  )

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
      // In a real implementation, this would fetch from ArgoCD API
      // For now, we use mock data
      const apps = getMockArgoApplications(clusterNames)

      setApplications(apps)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true

      // Save to cache
      saveToCache(APPS_CACHE_KEY, apps)
    } catch (err) {
      console.error('[useArgoCDApplications] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch ArgoCD applications')
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clusterNames])

  // Reset when switching to live mode (no real ArgoCD API)
  useEffect(() => {
    if (!demoMode) {
      setApplications([])
      setIsLoading(false)
      initialLoadDone.current = false
      return
    }
  }, [demoMode])

  // Initial load (only in demo mode - no real ArgoCD API yet)
  useEffect(() => {
    if (!demoMode) return
    if (!clustersLoading && clusterNames.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, clusterNames.length, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh (only in demo mode)
  useEffect(() => {
    if (!demoMode) return
    if (applications.length === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [applications.length, refetch, demoMode])

  return {
    applications,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}

// ============================================================================
// Hook: useArgoCDHealth
// ============================================================================

const HEALTH_CACHE_KEY = 'kc-argocd-health-cache'

interface UseArgoCDHealthResult {
  stats: ArgoHealthData
  total: number
  healthyPercent: number
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDHealth(): UseArgoCDHealthResult {
  const { isDemoMode: demoMode } = useDemoMode()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Initialize from cache
  const cachedData = useRef(loadFromCache<ArgoHealthData>(HEALTH_CACHE_KEY))
  const [stats, setStats] = useState<ArgoHealthData>(
    cachedData.current?.data || { healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 }
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedData.current?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const filteredClusterCount = useMemo(() => {
    if (isAllClustersSelected) return clusters.length
    return selectedClusters.length
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
      // In a real implementation, this would fetch from ArgoCD API
      const healthData = getMockHealthData(filteredClusterCount)

      setStats(healthData)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true

      // Save to cache
      saveToCache(HEALTH_CACHE_KEY, healthData)
    } catch (err) {
      console.error('[useArgoCDHealth] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch ArgoCD health data')
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [filteredClusterCount])

  // Reset when switching to live mode (no real ArgoCD API)
  useEffect(() => {
    if (!demoMode) {
      setStats({ healthy: 0, degraded: 0, progressing: 0, missing: 0, unknown: 0 })
      setIsLoading(false)
      initialLoadDone.current = false
      return
    }
  }, [demoMode])

  // Initial load (only in demo mode - no real ArgoCD API yet)
  useEffect(() => {
    if (!demoMode) return
    if (!clustersLoading && filteredClusterCount > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, filteredClusterCount, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh (only in demo mode)
  useEffect(() => {
    if (!demoMode) return
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    if (total === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [stats, refetch, demoMode])

  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const healthyPercent = total > 0 ? (stats.healthy / total) * 100 : 0

  return {
    stats,
    total,
    healthyPercent,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
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
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useArgoCDSyncStatus(localClusterFilter: string[] = []): UseArgoCDSyncStatusResult {
  const { isDemoMode: demoMode } = useDemoMode()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Initialize from cache
  const cachedData = useRef(loadFromCache<ArgoSyncData>(SYNC_CACHE_KEY))
  const [stats, setStats] = useState<ArgoSyncData>(
    cachedData.current?.data || { synced: 0, outOfSync: 0, unknown: 0 }
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedData.current?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const filteredClusterCount = useMemo(() => {
    let count = isAllClustersSelected ? clusters.length : selectedClusters.length
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
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
      // In a real implementation, this would fetch from ArgoCD API
      const syncData = getMockSyncStatusData(filteredClusterCount)

      setStats(syncData)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true

      // Save to cache
      saveToCache(SYNC_CACHE_KEY, syncData)
    } catch (err) {
      console.error('[useArgoCDSyncStatus] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch ArgoCD sync status')
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [filteredClusterCount])

  // Reset when switching to live mode (no real ArgoCD API)
  useEffect(() => {
    if (!demoMode) {
      setStats({ synced: 0, outOfSync: 0, unknown: 0 })
      setIsLoading(false)
      initialLoadDone.current = false
      return
    }
  }, [demoMode])

  // Initial load (only in demo mode - no real ArgoCD API yet)
  useEffect(() => {
    if (!demoMode) return
    if (!clustersLoading && filteredClusterCount > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clustersLoading, filteredClusterCount, demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh (only in demo mode)
  useEffect(() => {
    if (!demoMode) return
    const total = stats.synced + stats.outOfSync + stats.unknown
    if (total === 0) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [stats, refetch, demoMode])

  const total = stats.synced + stats.outOfSync + stats.unknown
  const syncedPercent = total > 0 ? (stats.synced / total) * 100 : 0
  const outOfSyncPercent = total > 0 ? (stats.outOfSync / total) * 100 : 0

  return {
    stats,
    total,
    syncedPercent,
    outOfSyncPercent,
    isLoading: isLoading || clustersLoading,
    isRefreshing,
    error,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
