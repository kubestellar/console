import { api, isBackendUnavailable } from '../../lib/api'
import { reportAgentDataError, reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode, isNetlifyDeployment, isDemoToken, subscribeDemoMode } from '../../lib/demoMode'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { getPresentationMode } from '../usePresentationMode'
import { registerCacheReset } from '../../lib/modeTransition'
import { resetFailuresForCluster } from '../../lib/cache'
import type { ClusterInfo, ClusterHealth } from './types'

// Refresh interval for automatic polling (2 minutes) - manual refresh bypasses this
export const REFRESH_INTERVAL_MS = 120000

// Polling intervals for cluster and GPU data freshness
export const CLUSTER_POLL_INTERVAL_MS = 60000  // 60 seconds
export const GPU_POLL_INTERVAL_MS = 30000      // 30 seconds

// Presentation mode multiplier for polling intervals (10 minutes minimum)
const PRESENTATION_MODE_INTERVAL_MS = 600000

export function getEffectiveInterval(baseInterval: number): number {
  return getPresentationMode() ? Math.max(baseInterval * 5, PRESENTATION_MODE_INTERVAL_MS) : baseInterval
}

// Minimum time to show the "Updating" indicator (ensures visibility for fast API responses)
export const MIN_REFRESH_INDICATOR_MS = 500

// Local agent URL for direct cluster access
export const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'

// ============================================================================
// Shared Cluster State - ensures all useClusters() consumers see the same data
// ============================================================================
export interface ClusterCache {
  clusters: ClusterInfo[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

// Cache cluster distribution in localStorage to prevent logo flickering on page load
const CLUSTER_DIST_CACHE_KEY = 'kubestellar-cluster-distributions'
type DistributionCache = Record<string, { distribution: string; namespaces?: string[] }>

function loadDistributionCache(): DistributionCache {
  try {
    const stored = localStorage.getItem(CLUSTER_DIST_CACHE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

function saveDistributionCache(cache: DistributionCache) {
  try {
    localStorage.setItem(CLUSTER_DIST_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage errors
  }
}

// Apply cached distributions to cluster list
// Falls back to URL-based detection for unreachable clusters
function applyDistributionCache(clusters: ClusterInfo[]): ClusterInfo[] {
  const distCache = loadDistributionCache()
  return clusters.map(cluster => {
    // If cluster already has distribution, keep it
    if (cluster.distribution) {
      return cluster
    }

    // Try cached distribution first
    const cached = distCache[cluster.name]
    if (cached) {
      return { ...cluster, distribution: cached.distribution, namespaces: cached.namespaces }
    }

    // Fallback: detect from server URL (works for unreachable clusters)
    const urlDistribution = detectDistributionFromServer(cluster.server)
    if (urlDistribution) {
      return { ...cluster, distribution: urlDistribution }
    }

    return cluster
  })
}

// Update distribution cache when clusters are updated
function updateDistributionCache(clusters: ClusterInfo[]) {
  const distCache = loadDistributionCache()
  let changed = false
  clusters.forEach(cluster => {
    if (cluster.distribution && (!distCache[cluster.name] || distCache[cluster.name].distribution !== cluster.distribution)) {
      distCache[cluster.name] = { distribution: cluster.distribution, namespaces: cluster.namespaces }
      changed = true
    }
  })
  if (changed) {
    saveDistributionCache(distCache)
  }
}

// Full cluster cache in localStorage - preserves all fields including cpuCores, distribution, etc.
const CLUSTER_CACHE_KEY = 'kubestellar-cluster-cache'

function loadClusterCacheFromStorage(): ClusterInfo[] {
  try {
    const stored = localStorage.getItem(CLUSTER_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out long context-path duplicates from cached data
        return parsed.filter((c: ClusterInfo) => !c.name.includes('/'))
      }
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveClusterCacheToStorage(clusters: ClusterInfo[]) {
  try {
    // Only save clusters with meaningful data
    // Filter out long context-path duplicates before saving
    const toSave = clusters.filter(c => c.name && !c.name.includes("/")).map(c => ({
      name: c.name,
      context: c.context,
      server: c.server,
      user: c.user,
      healthy: c.healthy,
      source: c.source,
      nodeCount: c.nodeCount,
      podCount: c.podCount,
      cpuCores: c.cpuCores,
      cpuRequestsMillicores: c.cpuRequestsMillicores,
      cpuRequestsCores: c.cpuRequestsCores,
      memoryBytes: c.memoryBytes,
      memoryGB: c.memoryGB,
      memoryRequestsBytes: c.memoryRequestsBytes,
      memoryRequestsGB: c.memoryRequestsGB,
      storageBytes: c.storageBytes,
      storageGB: c.storageGB,
      pvcCount: c.pvcCount,
      pvcBoundCount: c.pvcBoundCount,
      reachable: c.reachable,
      lastSeen: c.lastSeen,
      distribution: c.distribution,
      namespaces: c.namespaces,
    }))
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(toSave))
  } catch {
    // Ignore storage errors
  }
}

// Merge stored cluster data with fresh cluster list (preserves cached metrics)
// Uses cached value when new value is missing/zero (0 is treated as missing for metrics)
function mergeWithStoredClusters(newClusters: ClusterInfo[]): ClusterInfo[] {
  const stored = loadClusterCacheFromStorage()
  const storedMap = new Map(stored.map(c => [c.name, c]))

  return newClusters.map(cluster => {
    const cached = storedMap.get(cluster.name)
    if (cached) {
      // Helper: use new value only if it's a positive number, else use cached
      const pickMetric = (newVal: number | undefined, cachedVal: number | undefined) => {
        if (newVal !== undefined && newVal > 0) return newVal
        if (cachedVal !== undefined && cachedVal > 0) return cachedVal
        return newVal // fallback to new value (could be 0 or undefined)
      }

      // Merge: use new data but preserve cached metrics if new data is missing/zero
      return {
        ...cluster,
        cpuCores: pickMetric(cluster.cpuCores, cached.cpuCores),
        cpuRequestsMillicores: pickMetric(cluster.cpuRequestsMillicores, cached.cpuRequestsMillicores),
        cpuRequestsCores: pickMetric(cluster.cpuRequestsCores, cached.cpuRequestsCores),
        memoryBytes: pickMetric(cluster.memoryBytes, cached.memoryBytes),
        memoryGB: pickMetric(cluster.memoryGB, cached.memoryGB),
        memoryRequestsBytes: pickMetric(cluster.memoryRequestsBytes, cached.memoryRequestsBytes),
        memoryRequestsGB: pickMetric(cluster.memoryRequestsGB, cached.memoryRequestsGB),
        storageBytes: pickMetric(cluster.storageBytes, cached.storageBytes),
        storageGB: pickMetric(cluster.storageGB, cached.storageGB),
        nodeCount: pickMetric(cluster.nodeCount, cached.nodeCount),
        podCount: pickMetric(cluster.podCount, cached.podCount),
        pvcCount: cluster.pvcCount ?? cached.pvcCount, // pvcCount can be 0
        pvcBoundCount: cluster.pvcBoundCount ?? cached.pvcBoundCount,
        healthy: cluster.healthy ?? cached.healthy, // Preserve last-known health until fresh check completes
        reachable: cluster.reachable ?? cached.reachable,
        distribution: cluster.distribution || cached.distribution,
        namespaces: cluster.namespaces?.length ? cluster.namespaces : cached.namespaces,
      }
    }
    return cluster
  })
}

// Module-level shared state - initialize from localStorage if available
const storedClusters = loadClusterCacheFromStorage()
// In forced demo mode (Netlify), don't show loading - demo data will be set synchronously
const hasInitialData = storedClusters.length > 0 || isNetlifyDeployment
export let clusterCache: ClusterCache = {
  clusters: storedClusters,
  lastUpdated: storedClusters.length > 0 ? new Date() : null,
  isLoading: !hasInitialData, // Don't show loading if we have cached data or are in forced demo mode
  isRefreshing: false,
  error: null,
  consecutiveFailures: 0,
  isFailed: false,
  lastRefresh: storedClusters.length > 0 ? new Date() : null,
}

// Subscribers that get notified when cluster data changes
type ClusterSubscriber = (cache: ClusterCache) => void
export const clusterSubscribers = new Set<ClusterSubscriber>()

// Notify all subscribers of state change
export function notifyClusterSubscribers() {
  clusterSubscribers.forEach(subscriber => subscriber(clusterCache))
}

// ============================================================================
// Demo Mode Integration - Clear cluster cache when demo mode toggles ON
// ============================================================================

let lastClusterDemoMode: boolean | null = null

/**
 * Clear cluster cache and reset to demo data when demo mode toggles ON.
 * This ensures the clusters page shows demo data instead of cached live data.
 */
function handleClusterDemoModeChange() {
  const currentDemoMode = isDemoMode()
  if (lastClusterDemoMode !== null && lastClusterDemoMode !== currentDemoMode) {
    if (currentDemoMode) {
      // Switching TO demo mode - clear localStorage and reset to demo data
      try {
        localStorage.removeItem(CLUSTER_CACHE_KEY)
        localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
      } catch {
        // Ignore storage errors
      }

      // Reset cluster cache to demo data
      clusterCache = {
        clusters: getDemoClusters(),
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        isFailed: false,
        lastRefresh: new Date(),
      }
      notifyClusterSubscribers()
      console.log('[Clusters] Reset to demo data for demo mode')
    }
    // When switching FROM demo mode, fullFetchClusters will be called by useClusters hook
  }
  lastClusterDemoMode = currentDemoMode
}

// Initialize and subscribe to demo mode changes
if (typeof window !== 'undefined') {
  handleClusterDemoModeChange()
  subscribeDemoMode(handleClusterDemoModeChange)

  // Register with mode transition coordinator for unified cache clearing
  registerCacheReset('clusters', () => {
    try {
      localStorage.removeItem(CLUSTER_CACHE_KEY)
      localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    // Reset to loading state (shows skeletons) with empty data
    clusterCache = {
      clusters: [],
      lastUpdated: null,
      isLoading: true, // Triggers skeleton display
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    }
    notifyClusterSubscribers()
  })
}

// Debounced notification for batching rapid updates (prevents flashing during health checks)
let notifyTimeout: ReturnType<typeof setTimeout> | null = null
export function notifyClusterSubscribersDebounced() {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout)
  }
  notifyTimeout = setTimeout(() => {
    notifyClusterSubscribers()
    notifyTimeout = null
  }, 50) // 50ms debounce batches rapid health check completions
}

// Update shared cluster cache
export function updateClusterCache(updates: Partial<ClusterCache>) {
  // Apply cached distributions and merge with stored data to preserve metrics
  if (updates.clusters) {
    updates.clusters = mergeWithStoredClusters(updates.clusters)
    updates.clusters = applyDistributionCache(updates.clusters)
    // Save cluster data to localStorage
    saveClusterCacheToStorage(updates.clusters)
    updateDistributionCache(updates.clusters)
  }
  clusterCache = { ...clusterCache, ...updates }
  notifyClusterSubscribers()
}

// Share metrics between clusters pointing to the same server
// This handles cases where short-named aliases (e.g., "prow") point to the same
// server as full-context clusters that have metric data
export function shareMetricsBetweenSameServerClusters(clusters: ClusterInfo[]): ClusterInfo[] {
  // Build a map of server -> clusters with metrics
  const serverMetrics = new Map<string, ClusterInfo>()

  // First pass: find clusters that have metrics for each server
  for (const cluster of clusters) {
    if (!cluster.server) continue
    const existing = serverMetrics.get(cluster.server)
    // Prefer cluster with: nodeCount > 0, then capacity, then request data
    const clusterHasNodes = cluster.nodeCount && cluster.nodeCount > 0
    const clusterHasCapacity = !!cluster.cpuCores
    const clusterHasRequests = !!cluster.cpuRequestsCores
    const existingHasNodes = existing?.nodeCount && existing.nodeCount > 0
    const existingHasCapacity = !!existing?.cpuCores
    const existingHasRequests = !!existing?.cpuRequestsCores

    // Score: 4 points for nodes, 2 points for capacity, 1 point for requests
    const clusterScore = (clusterHasNodes ? 4 : 0) + (clusterHasCapacity ? 2 : 0) + (clusterHasRequests ? 1 : 0)
    const existingScore = (existingHasNodes ? 4 : 0) + (existingHasCapacity ? 2 : 0) + (existingHasRequests ? 1 : 0)

    if (!existing || clusterScore > existingScore) {
      serverMetrics.set(cluster.server, cluster)
    }
  }

  // Second pass: copy metrics to clusters missing them
  return clusters.map(cluster => {
    if (!cluster.server) return cluster

    const source = serverMetrics.get(cluster.server)
    if (!source) return cluster

    // Check if we need to copy anything - include nodeCount, podCount, and capacity/requests
    const needsNodes = (!cluster.nodeCount || cluster.nodeCount === 0) && source.nodeCount && source.nodeCount > 0
    const needsPods = (!cluster.podCount || cluster.podCount === 0) && source.podCount && source.podCount > 0
    const needsCapacity = !cluster.cpuCores && source.cpuCores
    const needsRequests = !cluster.cpuRequestsCores && source.cpuRequestsCores

    if (!needsNodes && !needsPods && !needsCapacity && !needsRequests) return cluster

    // Copy all health metrics from the source cluster (node/pod counts, capacity, requests)
    return {
      ...cluster,
      // Node and pod counts - critical for dashboard display
      nodeCount: needsNodes ? source.nodeCount : cluster.nodeCount,
      podCount: needsPods ? source.podCount : cluster.podCount,
      // Also copy healthy and reachable flags when we copy node data
      healthy: needsNodes ? source.healthy : cluster.healthy,
      reachable: needsNodes ? source.reachable : cluster.reachable,
      // CPU metrics
      cpuCores: cluster.cpuCores ?? source.cpuCores,
      cpuRequestsMillicores: cluster.cpuRequestsMillicores ?? source.cpuRequestsMillicores,
      cpuRequestsCores: cluster.cpuRequestsCores ?? source.cpuRequestsCores,
      cpuUsageCores: cluster.cpuUsageCores ?? source.cpuUsageCores,
      // Memory metrics
      memoryBytes: cluster.memoryBytes ?? source.memoryBytes,
      memoryGB: cluster.memoryGB ?? source.memoryGB,
      memoryRequestsBytes: cluster.memoryRequestsBytes ?? source.memoryRequestsBytes,
      memoryRequestsGB: cluster.memoryRequestsGB ?? source.memoryRequestsGB,
      memoryUsageGB: cluster.memoryUsageGB ?? source.memoryUsageGB,
      // Storage metrics
      storageBytes: cluster.storageBytes ?? source.storageBytes,
      storageGB: cluster.storageGB ?? source.storageGB,
      // Availability flags
      metricsAvailable: cluster.metricsAvailable ?? source.metricsAvailable,
    }
  })
}

// Deduplicate clusters that point to the same server URL
// Returns a single cluster per server with aliases tracking alternate context names
// This prevents double-counting in metrics and stats
export function deduplicateClustersByServer(clusters: ClusterInfo[]): ClusterInfo[] {
  // Group clusters by server URL
  const serverGroups = new Map<string, ClusterInfo[]>()
  const noServerClusters: ClusterInfo[] = []

  for (const cluster of clusters) {
    if (!cluster.server) {
      // Clusters without server URL can't be deduplicated
      noServerClusters.push(cluster)
      continue
    }
    const existing = serverGroups.get(cluster.server)
    if (existing) {
      existing.push(cluster)
    } else {
      serverGroups.set(cluster.server, [cluster])
    }
  }

  // For each server group, select a primary cluster and track aliases
  const deduplicatedClusters: ClusterInfo[] = []

  for (const [_server, group] of serverGroups) {
    if (group.length === 1) {
      // No duplicates, just add the cluster
      deduplicatedClusters.push({ ...group[0], aliases: [] })
      continue
    }

    // Multiple clusters point to same server - select primary and merge
    // Priority: 1) User-friendly name, 2) Has metrics, 3) Has more namespaces, 4) Current context, 5) Shorter name

    // Helper to detect OpenShift-generated long context names
    // These typically look like: "default/api-something.openshiftapps.com:6443/kube:admin"
    const isAutoGeneratedName = (name: string): boolean => {
      return name.includes('/api-') ||
             name.includes(':6443/') ||
             name.includes(':443/') ||
             name.includes('.openshiftapps.com') ||
             name.includes('.openshift.com') ||
             (name.includes('/') && name.includes(':') && name.length > 50)
    }

    const sorted = [...group].sort((a, b) => {
      // Strongly prefer user-friendly names over auto-generated OpenShift context names
      const aIsAuto = isAutoGeneratedName(a.name)
      const bIsAuto = isAutoGeneratedName(b.name)
      if (!aIsAuto && bIsAuto) return -1
      if (aIsAuto && !bIsAuto) return 1

      // Prefer cluster with metrics
      if (a.cpuCores && !b.cpuCores) return -1
      if (!a.cpuCores && b.cpuCores) return 1

      // Prefer cluster with more namespaces (likely more complete data)
      const aNamespaces = a.namespaces?.length || 0
      const bNamespaces = b.namespaces?.length || 0
      if (aNamespaces !== bNamespaces) return bNamespaces - aNamespaces

      // Prefer current context
      if (a.isCurrent && !b.isCurrent) return -1
      if (!a.isCurrent && b.isCurrent) return 1

      // Prefer shorter name (likely more user-friendly)
      return a.name.length - b.name.length
    })

    const primary = sorted[0]
    const aliases = sorted.slice(1).map(c => c.name)

    // Merge the best metrics from all duplicates
    let bestMetrics: Partial<ClusterInfo> = {}
    for (const cluster of group) {
      if (cluster.cpuCores && !bestMetrics.cpuCores) {
        bestMetrics = {
          cpuCores: cluster.cpuCores,
          memoryBytes: cluster.memoryBytes,
          memoryGB: cluster.memoryGB,
          storageBytes: cluster.storageBytes,
          storageGB: cluster.storageGB,
          nodeCount: cluster.nodeCount,
          podCount: cluster.podCount,
          cpuRequestsMillicores: cluster.cpuRequestsMillicores,
          cpuRequestsCores: cluster.cpuRequestsCores,
          memoryRequestsBytes: cluster.memoryRequestsBytes,
          memoryRequestsGB: cluster.memoryRequestsGB,
          pvcCount: cluster.pvcCount,
          pvcBoundCount: cluster.pvcBoundCount,
        }
      }
      // Take the best individual metrics
      if ((cluster.nodeCount || 0) > (bestMetrics.nodeCount || 0)) {
        bestMetrics.nodeCount = cluster.nodeCount
      }
      if ((cluster.podCount || 0) > (bestMetrics.podCount || 0)) {
        bestMetrics.podCount = cluster.podCount
      }
      // Merge request metrics - these may come from a different cluster than capacity
      if (cluster.cpuRequestsCores && !bestMetrics.cpuRequestsCores) {
        bestMetrics.cpuRequestsMillicores = cluster.cpuRequestsMillicores
        bestMetrics.cpuRequestsCores = cluster.cpuRequestsCores
      }
      if (cluster.memoryRequestsGB && !bestMetrics.memoryRequestsGB) {
        bestMetrics.memoryRequestsBytes = cluster.memoryRequestsBytes
        bestMetrics.memoryRequestsGB = cluster.memoryRequestsGB
      }
    }

    // Determine best health status (prefer healthy, then reachable)
    const anyHealthy = group.some(c => c.healthy)
    const anyReachable = group.some(c => c.reachable !== false)

    deduplicatedClusters.push({
      ...primary,
      ...bestMetrics,
      healthy: anyHealthy || primary.healthy,
      reachable: anyReachable ? true : primary.reachable,
      aliases,
    })
  }

  // Add clusters without server URL (can't be deduplicated)
  for (const cluster of noServerClusters) {
    deduplicatedClusters.push({ ...cluster, aliases: [] })
  }

  return deduplicatedClusters
}

// Update a single cluster in the shared cache (debounced to prevent flashing)
export function updateSingleClusterInCache(clusterName: string, updates: Partial<ClusterInfo>) {
  let updatedClusters = clusterCache.clusters.map(c => {
    if (c.name !== clusterName) return c

    // Merge updates with existing data
    const merged = { ...c }

    // For each update field, only apply if value is meaningful
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        // Don't overwrite with undefined - keep existing value
        return
      }

      // For numeric metrics, preserve positive cached values when new value is 0
      const metricsKeys = ['cpuCores', 'memoryBytes', 'memoryGB', 'storageBytes', 'storageGB', 'cpuRequestsMillicores', 'cpuRequestsCores', 'memoryRequestsBytes', 'memoryRequestsGB', 'cpuUsageMillicores', 'cpuUsageCores', 'memoryUsageBytes', 'memoryUsageGB']
      if (metricsKeys.includes(key) && typeof value === 'number' && value === 0) {
        // Keep existing positive value if available
        const existingValue = c[key as keyof ClusterInfo]
        if (typeof existingValue === 'number' && existingValue > 0) {
          return // Skip, keep existing positive value
        }
      }

      // Don't set reachable to false if we have valid cached node data
      // This prevents transient health check failures from immediately marking clusters as offline
      if (key === 'reachable' && value === false) {
        const hasValidCachedData = typeof c.nodeCount === 'number' && c.nodeCount > 0
        if (hasValidCachedData) {
          return // Skip, keep cluster reachable since we have valid data
        }
      }

      // Apply the update
      (merged as Record<string, unknown>)[key] = value
    })

    return merged
  })

  // Share metrics between clusters pointing to the same server
  // This ensures aliases (like "prow") get metrics from their full-context counterparts
  // Include nodeCount and podCount to ensure all health data is shared
  if (updates.nodeCount || updates.podCount || updates.cpuCores || updates.memoryGB || updates.storageGB || updates.cpuRequestsCores || updates.memoryRequestsGB) {
    updatedClusters = shareMetricsBetweenSameServerClusters(updatedClusters)
  }

  clusterCache = {
    ...clusterCache,
    clusters: updatedClusters,
  }
  // Persist all cluster data to localStorage
  saveClusterCacheToStorage(updatedClusters)
  // Persist distribution changes
  if (updates.distribution) {
    updateDistributionCache(updatedClusters)
  }
  // Use debounced notification to batch multiple cluster updates
  notifyClusterSubscribersDebounced()
}

// Track if initial fetch has been triggered (to avoid duplicate fetches)
export let initialFetchStarted = false

// Shared WebSocket connection state - prevents multiple connections
export const sharedWebSocket: {
  ws: WebSocket | null
  connecting: boolean
  reconnectTimeout: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
} = {
  ws: null,
  connecting: false,
  reconnectTimeout: null,
  reconnectAttempts: 0,
}

// Max reconnect attempts before giving up (prevents infinite loops)
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY_MS = 5000

// Track if backend WebSocket is known unavailable
let wsBackendUnavailable = false
let wsLastBackendCheck = 0
const WS_BACKEND_RECHECK_INTERVAL = 120000 // Re-check backend every 2 minutes

// Connect to shared WebSocket for kubeconfig change notifications
export function connectSharedWebSocket() {
  // Don't attempt WebSocket if not authenticated or using demo token
  if (isDemoToken()) {
    return
  }

  // Set connecting flag FIRST to prevent race conditions (JS is single-threaded but
  // multiple React hook instances can call this in quick succession during initial render)
  if (sharedWebSocket.connecting || sharedWebSocket.ws?.readyState === WebSocket.OPEN) {
    return
  }

  const now = Date.now()

  // Skip if backend is known unavailable from HTTP checks (prevents initial WebSocket error)
  if (isBackendUnavailable()) {
    wsBackendUnavailable = true
    return
  }

  // Skip if backend WebSocket is known unavailable (with periodic re-check)
  if (wsBackendUnavailable && now - wsLastBackendCheck < WS_BACKEND_RECHECK_INTERVAL) {
    return
  }

  // Immediately mark as connecting to prevent other calls from starting
  sharedWebSocket.connecting = true

  // Don't reconnect if we've exceeded max attempts
  if (sharedWebSocket.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Mark backend as unavailable and stop trying
    wsBackendUnavailable = true
    wsLastBackendCheck = now
    sharedWebSocket.connecting = false
    return
  }

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:8080/ws`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      // Send authentication message - backend requires this within 5 seconds
      const token = localStorage.getItem('token')
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }))
      } else {
        ws.close()
        return
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'authenticated') {
          sharedWebSocket.ws = ws
          sharedWebSocket.connecting = false
          sharedWebSocket.reconnectAttempts = 0 // Reset on successful connection
          wsBackendUnavailable = false // Backend is available
        } else if (msg.type === 'error') {
          ws.close()
        } else if (msg.type === 'kubeconfig_changed' || msg.type === 'clusters_updated') {
          // Reset failure tracking on fresh kubeconfig
          clusterCache.consecutiveFailures = 0
          clusterCache.isFailed = false
          // If clusters_updated includes cluster data, we could use it directly
          // For now, just trigger a full refresh to get health data too
          fullFetchClusters()
        }
      } catch {
        // Silently ignore parse errors
      }
    }

    ws.onerror = () => {
      // Silently handle connection errors - backend unavailability is expected in demo mode
      sharedWebSocket.connecting = false
    }

    ws.onclose = () => {
      sharedWebSocket.ws = null
      sharedWebSocket.connecting = false

      // Exponential backoff for reconnection (silent)
      if (sharedWebSocket.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, sharedWebSocket.reconnectAttempts)

        // Clear any existing reconnect timeout
        if (sharedWebSocket.reconnectTimeout) {
          clearTimeout(sharedWebSocket.reconnectTimeout)
        }

        sharedWebSocket.reconnectTimeout = setTimeout(() => {
          sharedWebSocket.reconnectAttempts++
          connectSharedWebSocket()
        }, delay)
      }
    }
  } catch {
    // Silently handle connection creation errors
    sharedWebSocket.connecting = false
  }
}

// Cleanup WebSocket connection
export function cleanupSharedWebSocket() {
  if (sharedWebSocket.reconnectTimeout) {
    clearTimeout(sharedWebSocket.reconnectTimeout)
    sharedWebSocket.reconnectTimeout = null
  }
  if (sharedWebSocket.ws) {
    sharedWebSocket.ws.close()
    sharedWebSocket.ws = null
  }
  sharedWebSocket.connecting = false
  sharedWebSocket.reconnectAttempts = 0
}

// Reset shared state on HMR (hot module reload) in development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    initialFetchStarted = false
    healthCheckFailures = 0 // Reset health check failures on HMR
    cleanupSharedWebSocket()
    clusterCache = {
      clusters: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    }
    clusterSubscribers.clear()
  })
}

// Fetch basic cluster list from local agent (fast, no health check)
async function fetchClusterListFromAgent(): Promise<ClusterInfo[] | null> {
  // On Netlify deployments (isNetlifyDeployment), skip agent entirely — there is
  // no local agent and the request would fail with CORS errors.
  // On localhost, always attempt to reach the agent — it may be running even if
  // AgentManager has not detected it yet.
  if (isNetlifyDeployment) return null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${LOCAL_AGENT_URL}/clusters`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok) {
      const data = await response.json()
      // Report successful data fetch - can recover from degraded state
      reportAgentDataSuccess()
      // Transform agent response to ClusterInfo format - mark as "checking" initially
      return (data.clusters || []).map((c: any) => ({
        name: c.name,
        context: c.context || c.name,
        server: c.server,
        user: c.user,
        // healthy left undefined until health check completes (prevents false-positive green status)
        reachable: undefined, // Unknown until health check completes
        source: 'kubeconfig',
        nodeCount: undefined, // undefined = still checking, 0 = unreachable
        podCount: undefined,
        isCurrent: c.isCurrent,
      }))
    } else {
      // Non-OK response (e.g., 503 Service Unavailable)
      reportAgentDataError('/clusters', `HTTP ${response.status}`)
    }
  } catch {
    // Error will be tracked by useLocalAgent's health check
  }
  return null
}

// Track consecutive health check failures to avoid spamming
export let healthCheckFailures = 0
const MAX_HEALTH_CHECK_FAILURES = 3

// Per-cluster failure tracking to prevent transient errors from showing "-"
// Track first failure timestamp - only mark unreachable after 5 minutes of consecutive failures
const clusterHealthFailureStart = new Map<string, number>() // timestamp of first failure
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes before marking as offline

// Helper to check if cluster has been failing long enough to mark offline
export function shouldMarkOffline(clusterName: string): boolean {
  const firstFailure = clusterHealthFailureStart.get(clusterName)
  if (!firstFailure) return false
  return Date.now() - firstFailure >= OFFLINE_THRESHOLD_MS
}

// Helper to record a failure (only sets timestamp if not already set)
export function recordClusterFailure(clusterName: string): void {
  if (!clusterHealthFailureStart.has(clusterName)) {
    clusterHealthFailureStart.set(clusterName, Date.now())
  }
}

// Helper to clear failure tracking on success
export function clearClusterFailure(clusterName: string): void {
  clusterHealthFailureStart.delete(clusterName)
}

// Fetch health for a single cluster - uses HTTP endpoint like GPU nodes
export async function fetchSingleClusterHealth(clusterName: string, kubectlContext?: string): Promise<ClusterHealth | null> {
  // Try local agent's HTTP endpoint first (same pattern as GPU nodes)
  // This is more reliable than WebSocket for simple data fetching
  if (!isNetlifyDeployment && !isAgentUnavailable()) {
    try {
      const context = kubectlContext || clusterName
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout
      const response = await fetch(`${LOCAL_AGENT_URL}/cluster-health?cluster=${encodeURIComponent(context)}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const health = await response.json()
        reportAgentDataSuccess()
        return health
      }
    } catch (err) {
      // Agent HTTP failed, will try backend below
    }
  }

  // Skip backend if we've had too many consecutive failures or using demo token
  if (healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES || isDemoToken()) {
    return null
  }

  // Fall back to backend API
  const token = localStorage.getItem('token')
  try {
    const response = await fetch(
      `/api/mcp/clusters/${encodeURIComponent(clusterName)}/health`,
      {
        signal: AbortSignal.timeout(10000),
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      }
    )
    if (response.ok) {
      healthCheckFailures = 0 // Reset on success
      return await response.json()
    }
    // Non-OK response (e.g., 500) - track failure
    healthCheckFailures++
  } catch {
    // Timeout or error - track failure
    healthCheckFailures++
  }
  return null
}

// Helper to detect distribution from namespace list
function detectDistributionFromNamespaces(namespaces: string[]): string | undefined {
  if (namespaces.some(ns => ns.startsWith('openshift-') || ns === 'openshift')) {
    return 'openshift'
  } else if (namespaces.some(ns => ns.startsWith('gke-') || ns === 'config-management-system')) {
    return 'gke'
  } else if (namespaces.some(ns => ns.startsWith('aws-') || ns.startsWith('amazon-'))) {
    return 'eks'
  } else if (namespaces.some(ns => ns.startsWith('azure-') || ns === 'azure-arc')) {
    return 'aks'
  } else if (namespaces.some(ns => ns === 'cattle-system' || ns.startsWith('cattle-'))) {
    return 'rancher'
  }
  return undefined
}

// Helper to detect distribution from server URL (fallback when cluster is unreachable)
// This allows identifying cluster type even without namespace access
function detectDistributionFromServer(server?: string): string | undefined {
  if (!server) return undefined
  const lower = server.toLowerCase()

  // OpenShift patterns
  if (lower.includes('.openshiftapps.com') ||
      lower.includes('.openshift.com') ||
      // IBM FMAAS OpenShift clusters (api.fmaas-*.fmaas.res.ibm.com:6443)
      (lower.includes('.fmaas.') && lower.includes(':6443')) ||
      // Generic OpenShift API pattern (api.*.example.com:6443)
      (lower.match(/^https?:\/\/api\.[^/]+:6443/) && !lower.includes('.eks.') && !lower.includes('.azmk8s.'))) {
    return 'openshift'
  }

  // EKS pattern
  if (lower.includes('.eks.amazonaws.com')) {
    return 'eks'
  }

  // GKE pattern
  if (lower.includes('.gke.io') || lower.includes('.container.googleapis.com')) {
    return 'gke'
  }

  // AKS pattern
  if (lower.includes('.azmk8s.io') || lower.includes('.hcp.')) {
    return 'aks'
  }

  // OCI OKE pattern
  if (lower.includes('.oraclecloud.com') || lower.includes('.oci.')) {
    return 'oci'
  }

  // DigitalOcean pattern
  if (lower.includes('.digitalocean.com') || lower.includes('.k8s.ondigitalocean.')) {
    return 'digitalocean'
  }

  return undefined
}

// Track backend API failures for distribution detection separately
let distributionDetectionFailures = 0
const MAX_DISTRIBUTION_FAILURES = 2

// Detect cluster distribution by checking for system namespaces
// Uses kubectl via WebSocket when available, falls back to backend API
async function detectClusterDistribution(clusterName: string, kubectlContext?: string): Promise<{ distribution?: string; namespaces?: string[] }> {
  // Try kubectl via WebSocket first (if agent available)
  // Use the kubectl context (full path) if provided, otherwise fall back to name
  if (!isAgentUnavailable()) {
    try {
      const response = await kubectlProxy.exec(
        ['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'],
        { context: kubectlContext || clusterName, timeout: 10000 }
      )
      if (response.exitCode === 0 && response.output) {
        const namespaces = response.output.split(/\s+/).filter(Boolean)
        const distribution = detectDistributionFromNamespaces(namespaces)
        return { distribution, namespaces }
      }
    } catch {
      // WebSocket failed, continue to backend fallback
    }
  }

  // Skip backend if using demo token, too many failures, or health checks failing
  if (isDemoToken() ||
      distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES ||
      healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES) {
    return {}
  }

  const token = localStorage.getItem('token')
  const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {}

  // Helper to extract namespaces from API response
  const extractNamespaces = (items: Array<{ namespace?: string }>): string[] => {
    return Array.from(new Set<string>(
      items.map(item => item.namespace).filter((ns): ns is string => Boolean(ns))
    ))
  }

  // Try pods endpoint first
  try {
    const response = await fetch(
      `/api/mcp/pods?cluster=${encodeURIComponent(clusterName)}&limit=500`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0 // Reset on success
      const data = await response.json()
      const namespaces = extractNamespaces(data.pods || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
      if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
    }
  } catch {
    distributionDetectionFailures++
    if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
  }

  // Fallback: try events endpoint
  try {
    const response = await fetch(
      `/api/mcp/events?cluster=${encodeURIComponent(clusterName)}&limit=200`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json()
      const namespaces = extractNamespaces(data.events || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
      if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
    }
  } catch {
    distributionDetectionFailures++
    if (distributionDetectionFailures >= MAX_DISTRIBUTION_FAILURES) return {}
  }

  // Fallback: try deployments endpoint
  try {
    const response = await fetch(
      `/api/mcp/deployments?cluster=${encodeURIComponent(clusterName)}`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json()
      const namespaces = extractNamespaces(data.deployments || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    } else {
      distributionDetectionFailures++
    }
  } catch {
    distributionDetectionFailures++
  }

  return {}
}

// Process a single cluster's health check
async function processClusterHealth(cluster: ClusterInfo): Promise<void> {
    // Use cluster.context for kubectl commands (full context path), cluster.name for cache key
    const health = await fetchSingleClusterHealth(cluster.name, cluster.context)

    if (health) {
      // Check if the cluster itself is reachable based on the response data
      // A cluster is reachable if it has valid node data OR no error message
      const hasValidData = health.nodeCount !== undefined && health.nodeCount > 0
      const isReachable = hasValidData || !health.errorMessage

      // Only clear failure tracking if the cluster is actually reachable
      // Don't clear just because we got a response - the response might say "unreachable"
      if (isReachable) {
        clearClusterFailure(cluster.name)
      }

      if (isReachable) {
        // Cluster is reachable - update with fresh data

        // Detect cluster distribution (async, non-blocking update)
        // Use cluster.context for kubectl commands
        detectClusterDistribution(cluster.name, cluster.context).then(({ distribution, namespaces }) => {
          if (distribution || namespaces) {
            updateSingleClusterInCache(cluster.name, { distribution, namespaces })
          }
        })

        updateSingleClusterInCache(cluster.name, {
          // If we have nodes, consider healthy based on actual node readiness
          // healthy: true means all nodes are ready; false means some aren't ready but cluster is reachable
          healthy: hasValidData ? health.healthy : false,
          reachable: true,  // We definitely reached the cluster if we have data
          nodeCount: health.nodeCount,
          podCount: health.podCount,
          cpuCores: health.cpuCores,
          cpuRequestsCores: health.cpuRequestsCores,
          // Actual usage from metrics-server
          cpuUsageCores: health.cpuUsageCores,
          memoryUsageGB: health.memoryUsageGB,
          metricsAvailable: health.metricsAvailable,
          // Memory/storage metrics
          memoryBytes: health.memoryBytes,
          memoryGB: health.memoryGB,
          memoryRequestsGB: health.memoryRequestsGB,
          storageBytes: health.storageBytes,
          storageGB: health.storageGB,
          pvcCount: health.pvcCount,
          pvcBoundCount: health.pvcBoundCount,
          errorType: undefined,
          errorMessage: undefined,
          refreshing: false,
        })
      } else {
        // Cluster reported as unreachable by the agent
        // Trust the agent's reachable: false immediately - the agent has direct
        // access to the cluster and knows best. The 5-minute grace period is for
        // cases where we get no response at all (backend/agent unavailable).
        recordClusterFailure(cluster.name)

        // If agent explicitly says reachable: false, mark offline immediately
        // This is more reliable than trying to parse error messages
        const agentSaysUnreachable = health.reachable === false

        // Also check for definitive network errors as a fallback
        const errorMsg = health.errorMessage?.toLowerCase() || ''
        const isDefinitiveError = errorMsg.includes('connection refused') ||
          errorMsg.includes('connection reset') ||
          errorMsg.includes('no such host') ||
          errorMsg.includes('network is unreachable') ||
          health.errorType === 'network'

        if (agentSaysUnreachable || isDefinitiveError || shouldMarkOffline(cluster.name)) {
          // Agent says unreachable, definitive error, or 5+ minutes of failures - mark as unreachable
          updateSingleClusterInCache(cluster.name, {
            healthy: false,
            reachable: false,
            nodeCount: 0,
            errorType: health.errorType,
            errorMessage: health.errorMessage,
            refreshing: false,
          })
        } else {
          // Transient failure - keep existing cached values, just clear refreshing
          updateSingleClusterInCache(cluster.name, {
            refreshing: false,
          })
        }
      }
    } else {
      // No health data - could be backend error or agent unavailable
      // Track failure start time but don't immediately mark as unreachable
      recordClusterFailure(cluster.name)

      if (shouldMarkOffline(cluster.name)) {
        // 5+ minutes of failures - mark as unreachable
        updateSingleClusterInCache(cluster.name, {
          healthy: false,
          reachable: false,
          errorMessage: 'Unable to connect after 5 minutes',
          refreshing: false,
        })
      } else {
        // Transient failure - keep existing cached values
        updateSingleClusterInCache(cluster.name, {
          refreshing: false,
        })
      }
    }
}

// Concurrency limit for health checks - rolling concurrency for 100+ clusters
// Keep at 2 to avoid overwhelming the local agent WebSocket connection
const HEALTH_CHECK_CONCURRENCY = 2

// Progressive health check with rolling concurrency
// Uses continuous processing: as soon as one finishes, the next starts
// This is much more efficient than strict batches for large cluster counts
async function checkHealthProgressively(clusterList: ClusterInfo[]) {
  if (clusterList.length === 0) return

  const queue = [...clusterList]
  const inProgress = new Set<string>()
  let completed = 0

  // Process next cluster from queue
  const processNext = async (): Promise<void> => {
    while (queue.length > 0 && inProgress.size < HEALTH_CHECK_CONCURRENCY) {
      const cluster = queue.shift()!
      const key = cluster.name
      inProgress.add(key)

      // Don't await here - let multiple run in parallel
      processClusterHealth(cluster)
        .finally(() => {
          inProgress.delete(key)
          completed++
          // Start next one immediately when one finishes
          if (queue.length > 0) {
            processNext()
          }
        })
    }
  }

  // Start initial batch up to concurrency limit
  const initialBatch = Math.min(HEALTH_CHECK_CONCURRENCY, clusterList.length)
  for (let i = 0; i < initialBatch; i++) {
    processNext()
  }

  // Wait for all to complete (non-blocking check)
  while (completed < clusterList.length) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// Track if a fetch is in progress to prevent duplicate requests
let fetchInProgress = false

// Full refetch - updates shared cache with loading state
// Deduplicates concurrent calls - only one fetch runs at a time
export async function fullFetchClusters() {
  // If a fetch is already in progress, skip this call (deduplication)
  // Check this BEFORE setting isRefreshing to avoid getting stuck
  if (fetchInProgress) {
    return
  }

  // DEMO MODE: When user has explicitly enabled demo mode, use demo data immediately.
  // Don't try to fetch from agent - user wants to see demo data, not live data.
  // This respects the user's explicit choice to enable demo mode.
  if (isDemoMode()) {
    updateClusterCache({
      clusters: getDemoClusters(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastUpdated: new Date(),
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })
    return
  }

  // On forced demo mode deployments (Netlify), skip fetching entirely to avoid flicker.
  // Demo data is already in the initial cache state, so no loading indicators needed.
  if (isNetlifyDeployment) {
    const token = localStorage.getItem('token')
    if (!token || token === 'demo-token') {
      // Only update if cache is empty (first load) - otherwise preserve existing demo data
      if (clusterCache.clusters.length === 0) {
        updateClusterCache({
          clusters: getDemoClusters(),
          isLoading: false,
          isRefreshing: false,
          error: null,
        })
      }
      return
    }
  }

  fetchInProgress = true

  // If we have cached data, show refreshing; otherwise show loading
  const hasCachedData = clusterCache.clusters.length > 0
  const startTime = Date.now()

  // Always set isRefreshing first so indicator shows
  if (hasCachedData) {
    updateClusterCache({ isRefreshing: true })
  } else {
    updateClusterCache({ isLoading: true, isRefreshing: true })
  }

  // Helper to ensure minimum visible duration for refresh animation
  const finishWithMinDuration = async (updates: Partial<typeof clusterCache>) => {
    const elapsed = Date.now() - startTime
    const minDuration = MIN_REFRESH_INDICATOR_MS
    if (elapsed < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsed))
    }
    fetchInProgress = false
    updateClusterCache(updates)
  }

  // Try local agent first for live cluster data.
  // NOTE: We no longer auto-disable demo mode here. If user explicitly enabled demo mode,
  // we respect that choice (handled by the early return above).
  try {
    const agentClusters = await fetchClusterListFromAgent()
    if (agentClusters) {
      // Merge new cluster list with existing cached health data (preserve stats during refresh)
      const existingClusters = clusterCache.clusters
      const mergedClusters = agentClusters.map(newCluster => {
        const existing = existingClusters.find(c => c.name === newCluster.name)
        if (existing) {
          // Preserve existing health data and detected distribution during refresh
          return {
            ...newCluster,
            // Preserve detected distribution and namespaces (use existing if available, else keep new)
            distribution: existing.distribution || newCluster.distribution,
            namespaces: existing.namespaces?.length ? existing.namespaces : newCluster.namespaces,
            // Preserve health data if available
            ...(existing.nodeCount !== undefined ? {
              nodeCount: existing.nodeCount,
              podCount: existing.podCount,
              cpuCores: existing.cpuCores,
              memoryGB: existing.memoryGB,
              storageGB: existing.storageGB,
              healthy: existing.healthy,
              // If we have node data, cluster is reachable - don't preserve false reachable status
              reachable: existing.nodeCount > 0 ? true : existing.reachable,
            } : {}),
            refreshing: false, // Keep false during background polling - no visual indicator
          }
        }
        return newCluster
      })
      // Deduplicate clusters by server URL - prefers short names when available
      // but keeps long names (e.g., '/api-pokprod001...' or 'default/api-...') if no short alias exists
      const dedupedClusters = deduplicateClustersByServer(mergedClusters)

      // Show clusters immediately with preserved health data
      await finishWithMinDuration({
        clusters: dedupedClusters,
        error: null,
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        consecutiveFailures: 0,
        isFailed: false,
        lastRefresh: new Date(),
      })
      // Reset flag before returning - allows subsequent refresh calls
      fetchInProgress = false
      // Check health progressively (non-blocking) - use deduplicated list to avoid
      // running health checks on long context-path duplicates
      checkHealthProgressively(dedupedClusters)
      return
    }

    // Agent unavailable — if demo mode is on and no real token, use demo data
    if (isDemoMode() && isDemoToken()) {
      await finishWithMinDuration({
        clusters: getDemoClusters(),
        isLoading: false,
        isRefreshing: false,
        error: null,
      })
      return
    }

    // Skip backend if not authenticated
    const token = localStorage.getItem('token')
    if (!token) {
      await finishWithMinDuration({ isLoading: false, isRefreshing: false })
      return
    }

    // Fall back to backend API
    const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
    // Merge new cluster list with existing cached data (preserve distribution, health, etc.)
    const existingClusters = clusterCache.clusters
    const mergedClusters = (data.clusters || []).map(newCluster => {
      const existing = existingClusters.find(c => c.name === newCluster.name)
      if (existing) {
        return {
          ...newCluster,
          // Preserve detected distribution and namespaces (use existing if available, else keep new)
          distribution: existing.distribution || newCluster.distribution,
          namespaces: existing.namespaces?.length ? existing.namespaces : newCluster.namespaces,
          // Preserve health data if available
          ...(existing.nodeCount !== undefined ? {
            nodeCount: existing.nodeCount,
            podCount: existing.podCount,
            cpuCores: existing.cpuCores,
            memoryGB: existing.memoryGB,
            storageGB: existing.storageGB,
            healthy: existing.healthy,
            // If we have node data, cluster is reachable - don't preserve false reachable status
            reachable: existing.nodeCount > 0 ? true : existing.reachable,
          } : {}),
        }
      }
      return newCluster
    })
    await finishWithMinDuration({
      clusters: mergedClusters,
      error: null,
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })
    fetchInProgress = false
    // Check health progressively (non-blocking) - will update each cluster's data including cpuCores
    checkHealthProgressively(data.clusters || [])
  } catch (err) {
    // Always fall back gracefully to demo clusters - never show blocking errors
    // This ensures the UI always has data to display
    const newFailures = clusterCache.consecutiveFailures + 1
    await finishWithMinDuration({
      error: null, // Never set error - always fall back to demo data gracefully
      clusters: clusterCache.clusters.length > 0 ? clusterCache.clusters : getDemoClusters(),
      isLoading: false,
      isRefreshing: false,
      consecutiveFailures: newFailures,
      isFailed: false, // Don't mark as failed - we have demo data
      lastRefresh: new Date(),
    })
    fetchInProgress = false
  }
}

// Refresh health for a single cluster (exported for use in components)
// Keeps cached values visible while refreshing - only updates surgically when new data is available
export async function refreshSingleCluster(clusterName: string): Promise<void> {
  // Clear failure tracking on manual refresh - user is explicitly requesting fresh data
  clearClusterFailure(clusterName)

  // Reset cache layer failure counters so backoff is removed immediately
  resetFailuresForCluster(clusterName)

  // Look up the cluster's context for kubectl commands
  const clusterInfo = clusterCache.clusters.find(c => c.name === clusterName)
  const kubectlContext = clusterInfo?.context

  // Mark the cluster as refreshing immediately (no debounce - user needs to see the spinner)
  clusterCache = {
    ...clusterCache,
    clusters: clusterCache.clusters.map(c =>
      c.name === clusterName ? { ...c, refreshing: true } : c
    ),
  }
  notifyClusterSubscribers() // Immediate notification for user feedback

  const health = await fetchSingleClusterHealth(clusterName, kubectlContext)

  if (health) {
    // Health data available - cluster is reachable if we got a response
    // Only mark unreachable if explicitly set to false by backend
    const isReachable = health.reachable !== false
    updateSingleClusterInCache(clusterName, {
      healthy: health.healthy,
      reachable: isReachable,
      nodeCount: health.nodeCount,
      podCount: health.podCount,
      cpuCores: health.cpuCores,
      cpuRequestsCores: health.cpuRequestsCores,
      // Memory/storage metrics
      memoryBytes: health.memoryBytes,
      memoryGB: health.memoryGB,
      memoryRequestsGB: health.memoryRequestsGB,
      storageBytes: health.storageBytes,
      storageGB: health.storageGB,
      pvcCount: health.pvcCount,
      pvcBoundCount: health.pvcBoundCount,
      errorType: health.errorType,
      errorMessage: health.errorMessage,
      refreshing: false,
    })
  } else {
    // No health data or timeout - track failure start time
    recordClusterFailure(clusterName)

    if (shouldMarkOffline(clusterName)) {
      // 5+ minutes of failures - mark as unreachable
      updateSingleClusterInCache(clusterName, {
        healthy: false,
        reachable: false,
        errorType: 'timeout',
        errorMessage: 'Unable to connect after 5 minutes',
        refreshing: false,
      })
    } else {
      // Transient failure - keep showing previous data
      // Just clear the refreshing state
      updateSingleClusterInCache(clusterName, {
        refreshing: false,
      })
    }
  }
}

// Demo data fallbacks
function getDemoClusters(): ClusterInfo[] {
  return [
    // One cluster for each provider type to showcase all icons
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, distribution: 'kind' },
    { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, distribution: 'minikube' },
    { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, distribution: 'k3s' },
    { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
    { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, distribution: 'gke' },
    { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
    { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift', namespaces: ['openshift-operators', 'openshift-monitoring'] },
    { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
    { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, distribution: 'alibaba' },
    { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, distribution: 'digitalocean' },
    { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, distribution: 'rancher' },
    { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, distribution: 'kubernetes' },
  ]
}

// Lightweight reference to cluster cache for domain modules
// Modules that don't need the full singleton can import this
export const clusterCacheRef = {
  get clusters(): ClusterInfo[] {
    return clusterCache.clusters
  },
}

// Subscribe to cluster cache changes (for modules that need reactive updates)
export function subscribeClusterCache(callback: (cache: ClusterCache) => void): () => void {
  clusterSubscribers.add(callback)
  return () => clusterSubscribers.delete(callback)
}

// Setter functions for module-level state (ES modules can't assign to imported bindings)
export function setInitialFetchStarted(value: boolean) {
  initialFetchStarted = value
}

export function setHealthCheckFailures(value: number) {
  healthCheckFailures = value
}
