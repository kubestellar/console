import { useState, useEffect, useCallback, useRef } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../../lib/demoMode'
import { fetchSSE } from '../../../lib/sseClient'
import { useDemoMode } from '../../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS, SHORT_DELAY_MS, FOCUS_DELAY_MS } from '../../../lib/constants/network'
import type { HelmRelease, HelmHistoryEntry } from '../types'

// Demo Helm releases shown when in demo mode
let _cachedDemoReleases: HelmRelease[] | null = null
function getDemoHelmReleases(): HelmRelease[] {
  if (_cachedDemoReleases) return _cachedDemoReleases
  _cachedDemoReleases = [
    { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'eks-prod-us-east-1' },
    { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3', cluster: 'eks-prod-us-east-1' },
    { name: 'nginx-ingress', namespace: 'ingress', revision: '8', updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'deployed', chart: 'ingress-nginx-4.8.3', app_version: '1.9.4', cluster: 'eks-prod-us-east-1' },
    { name: 'cert-manager', namespace: 'cert-manager', revision: '2', updated: new Date(Date.now() - 72 * 3600000).toISOString(), status: 'deployed', chart: 'cert-manager-1.13.3', app_version: '1.13.3', cluster: 'gke-staging' },
    { name: 'redis', namespace: 'data', revision: '4', updated: new Date(Date.now() - 12 * 3600000).toISOString(), status: 'deployed', chart: 'redis-18.4.0', app_version: '7.2.3', cluster: 'gke-staging' },
    { name: 'api-gateway', namespace: 'production', revision: '6', updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', cluster: 'eks-prod-us-east-1' },
    { name: 'elasticsearch', namespace: 'logging', revision: '3', updated: new Date(Date.now() - 48 * 3600000).toISOString(), status: 'deployed', chart: 'elasticsearch-8.5.1', app_version: '8.11.1', cluster: 'vllm-gpu-cluster' },
    { name: 'vault', namespace: 'security', revision: '2', updated: new Date(Date.now() - 168 * 3600000).toISOString(), status: 'deployed', chart: 'vault-0.27.0', app_version: '1.15.4', cluster: 'vllm-gpu-cluster' },
  ]
  return _cachedDemoReleases
}

// Demo Helm history entries for a release
function getDemoHelmHistory(): HelmHistoryEntry[] {
  return [
    { revision: 6, updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', description: 'Upgrade failed: container crashed' },
    { revision: 5, updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
    { revision: 4, updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.7.0', app_version: '2.48.0', description: 'Upgrade complete' },
    { revision: 3, updated: new Date(Date.now() - 72 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.6.0', app_version: '2.47.2', description: 'Upgrade complete' },
    { revision: 2, updated: new Date(Date.now() - 168 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.5.0', app_version: '2.47.0', description: 'Upgrade complete' },
    { revision: 1, updated: new Date(Date.now() - 720 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.0.0', app_version: '2.45.0', description: 'Install complete' },
  ]
}

// Demo Helm values for a release
function getDemoHelmValues(): Record<string, unknown> {
  return {
    replicaCount: 2,
    image: { repository: 'prom/prometheus', tag: 'v2.48.1', pullPolicy: 'IfNotPresent' },
    service: { type: 'ClusterIP', port: 9090 },
    resources: { limits: { cpu: '500m', memory: '512Mi' }, requests: { cpu: '200m', memory: '256Mi' } },
    persistence: { enabled: true, size: '50Gi', storageClass: 'gp3' },
    alertmanager: { enabled: true },
    nodeExporter: { enabled: true },
    serverFiles: { 'alerting_rules.yml': {}, 'recording_rules.yml': {} } }
}

// Helm releases cache with localStorage persistence
const HELM_RELEASES_CACHE_KEY = 'kc-helm-releases-cache'
const HELM_HISTORY_CACHE_KEY = 'kc-helm-history-cache'
const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale
const HELM_REFRESH_INTERVAL_MS = 120000 // 2 minutes auto-refresh

interface HelmReleasesCache {
  data: HelmRelease[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  listeners: Set<(state: HelmReleasesCacheState) => void>
}

interface HelmReleasesCacheState {
  releases: HelmRelease[]
  isLoading: boolean  // Added for unified demo mode switching
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
}

// Load from localStorage
function loadHelmReleasesFromStorage(): { data: HelmRelease[], timestamp: number } {
  try {
    const stored = localStorage.getItem(HELM_RELEASES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

// Save to localStorage
function saveHelmReleasesToStorage(data: HelmRelease[], timestamp: number) {
  try {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data, timestamp }))
  } catch { /* ignore storage errors */ }
}

// Initialize from localStorage
const storedHelmReleases = loadHelmReleasesFromStorage()

const helmReleasesCache: HelmReleasesCache = {
  data: storedHelmReleases.data,
  timestamp: storedHelmReleases.timestamp,
  consecutiveFailures: 0,
  lastError: null,
  listeners: new Set()
}

// Hook to get Helm releases - uses shared cache with localStorage persistence
export function useHelmReleases(cluster?: string) {
  // Initialize from cache (localStorage backed)
  const [releases, setReleases] = useState<HelmRelease[]>(helmReleasesCache.data)
  const [isLoading, setIsLoading] = useState(helmReleasesCache.data.length === 0)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(helmReleasesCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(helmReleasesCache.consecutiveFailures)
  const consecutiveFailuresRef = useRef(consecutiveFailures)
  consecutiveFailuresRef.current = consecutiveFailures
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
  )

  // Register this component to receive cache updates
  useEffect(() => {
    const updateHandler = (state: HelmReleasesCacheState) => {
      setReleases(state.releases)
      if (state.isLoading !== undefined) setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }
    helmReleasesCache.listeners.add(updateHandler)
    return () => { helmReleasesCache.listeners.delete(updateHandler) }
  }, [])

  // Stable reference — prevents refetch useCallback from changing every render
  const notifyListenersRef = useRef((isRefreshing: boolean, isLoading = false) => {
    const state: HelmReleasesCacheState = {
      releases: helmReleasesCache.data,
      isLoading,
      isRefreshing,
      consecutiveFailures: helmReleasesCache.consecutiveFailures,
      lastError: helmReleasesCache.lastError,
      lastRefresh: helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
    }
    helmReleasesCache.listeners.forEach(listener => listener(state))
  })
  const notifyListeners = notifyListenersRef.current

  const refetch = useCallback(async (silent = false) => {
    // Skip fetching entirely in forced demo mode (Netlify) — no backend
    if (isNetlifyDeployment) {
      setIsLoading(false)
      setIsRefreshing(false)
      notifyListeners(false)
      return
    }

    if (!silent) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
      notifyListeners(true)
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const url = `/api/gitops/helm-releases?${params}`

      // Skip API calls when using demo token — provide demo releases
      const token = await getStoredAuthToken()
      if (isDemoMode()) {
        const demoReleases = getDemoHelmReleases()
        if (!cluster) {
          helmReleasesCache.data = demoReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          notifyListeners(false)
        }
        setReleases(demoReleases)
        setLastRefresh(Date.now())
        setIsLoading(false)
        setIsRefreshing(false)
        notifyListeners(false)
        return
      }

      // Try SSE streaming first for progressive rendering
      const sseAvailable = token && token !== 'demo-token'
      let sseSucceeded = false

      if (sseAvailable) {
        try {
          const sseParams: Record<string, string> = {}
          if (cluster) sseParams.cluster = cluster
          const accumulated: HelmRelease[] = []

          const result = await fetchSSE<HelmRelease>({
            url: '/api/gitops/helm-releases/stream',
            params: sseParams,
            itemsKey: 'releases',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setReleases([...accumulated])
              setIsLoading(false)
            } })

          sseSucceeded = true
          const newReleases = result

          if (!cluster) {
            helmReleasesCache.data = newReleases
            helmReleasesCache.timestamp = Date.now()
            helmReleasesCache.consecutiveFailures = 0
            helmReleasesCache.lastError = null
            saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
            notifyListeners(false)
          }

          setReleases(newReleases)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        } catch {
          // SSE failed — fall through to REST
        }
      }

      // REST fallback if SSE unavailable or failed
      if (!sseSucceeded) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        const data = await response.json() as { releases: HelmRelease[] }
        const newReleases = data.releases || []

        if (!cluster) {
          helmReleasesCache.data = newReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
          notifyListeners(false)
        }

        setReleases(newReleases)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm releases'

      // Increment failure count
      if (!cluster) {
        helmReleasesCache.consecutiveFailures++
        helmReleasesCache.lastError = errorMessage
        notifyListeners(false)
      }

      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)
      // Keep existing cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      if (!cluster) notifyListeners(false)
    }
  }, [cluster, notifyListeners])

  useEffect(() => {
    // Use cached data if fresh enough and we're fetching all clusters
    const now = Date.now()
    const cacheAge = now - helmReleasesCache.timestamp
    const cacheValid = !cluster && helmReleasesCache.data.length > 0 && cacheAge < HELM_CACHE_TTL_MS

    if (cacheValid) {
      setReleases(helmReleasesCache.data)
      setIsLoading(false)
      // Still refresh in background if somewhat stale
      if (cacheAge > HELM_CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    // Poll for Helm releases (shared interval prevents duplicates across components)
    // Use ref for consecutiveFailures to avoid re-triggering effect on each failure
    const unsubscribePolling = subscribePolling(
      `helmReleases:${cluster || 'all'}`,
      getEffectiveInterval(HELM_REFRESH_INTERVAL_MS, consecutiveFailuresRef.current),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-releases:${cluster || 'all'}`, () => refetch(false))

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cluster])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  const isFailed = consecutiveFailures >= 3

  return { releases, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed, lastRefresh }
}

// Register with mode transition coordinator for unified cache clearing
if (typeof window !== 'undefined') {
  registerCacheReset('helm', () => {
    try {
      localStorage.removeItem(HELM_RELEASES_CACHE_KEY)
      localStorage.removeItem(HELM_HISTORY_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    // Reset module-level cache
    helmReleasesCache.data = []
    helmReleasesCache.timestamp = 0
    helmReleasesCache.consecutiveFailures = 0
    helmReleasesCache.lastError = null

    // Notify all listeners with isLoading: true to trigger skeleton display
    helmReleasesCache.listeners.forEach(listener => {
      listener({
        releases: [],
        isLoading: true,  // Trigger skeleton display
        isRefreshing: false,
        consecutiveFailures: 0,
        lastError: null,
        lastRefresh: null
      })
    })
  })
}

// Export internal symbols for assembly in barrel
export { getDemoHelmReleases, loadHelmReleasesFromStorage, saveHelmReleasesToStorage,
  HELM_RELEASES_CACHE_KEY, HELM_HISTORY_CACHE_KEY, HELM_CACHE_TTL_MS, HELM_REFRESH_INTERVAL_MS }
