import { startTransition } from 'react'
import { api, isBackendUnavailable } from '../../lib/api'
import { reportAgentDataError, reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode, isNetlifyDeployment, isDemoToken, subscribeDemoMode } from '../../lib/demoMode'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { registerCacheReset, triggerAllRefetches } from '../../lib/modeTransition'
import { resetFailuresForCluster, resetAllCacheFailures } from '../../lib/cache'
import { clusterCacheRef, setClusterCacheRefClusters } from './clusterCacheRef'
import { hostnameEndsWith, hostnameContainsLabel } from '../../lib/utils/urlHostname'
import { appendWsAuthToken } from '../../lib/utils/wsAuth'
import { emitAgentTokenFailure } from '../../lib/analytics'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  LOCAL_AGENT_HTTP_URL,
  MCP_HOOK_TIMEOUT_MS,
  METRICS_SERVER_TIMEOUT_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../../lib/constants'
import { STORAGE_KEY_TOKEN } from '../../lib/constants/storage'
import { MCP_PROBE_TIMEOUT_MS, FOCUS_DELAY_MS, KUBECTL_MAX_TIMEOUT_MS, isLocalAgentSuppressed } from '../../lib/constants/network'
import type { ClusterInfo, ClusterHealth } from './types'

// Re-export canonical constant under the name used by MCP hooks
export const REFRESH_INTERVAL_MS = DEFAULT_REFRESH_INTERVAL_MS

// Polling intervals for cluster and GPU data freshness
export const CLUSTER_POLL_INTERVAL_MS = 60000  // 60 seconds
export const GPU_POLL_INTERVAL_MS = 30000      // 30 seconds

/** Cache TTL: matches cluster poll interval for freshness checks */
export const CACHE_TTL_MS = CLUSTER_POLL_INTERVAL_MS

export function getEffectiveInterval(baseInterval: number): number {
  return baseInterval
}

/** Name length above which a cluster context name is considered auto-generated */
const AUTO_GENERATED_NAME_LENGTH_THRESHOLD = 50

/** Debounce delay for batching rapid cluster health check notifications */
const CLUSTER_NOTIFY_DEBOUNCE_MS = 50

// Minimum time to show the "Updating" indicator (ensures visibility for fast API responses)
export const MIN_REFRESH_INDICATOR_MS = 500

// Re-export for backward compatibility
export const LOCAL_AGENT_URL = LOCAL_AGENT_HTTP_URL

const AGENT_TOKEN_STORAGE_KEY = 'kc-agent-token'
const AGENT_TOKEN_FETCH_TIMEOUT_MS = 5000

let agentTokenPromise: Promise<string> | null = null
/** Session-level dedup: only emit one agent_token_failure per page load */
let agentTokenFailureEmitted = false

/** Reset internal getAgentToken state — exposed for tests only. */
export function _resetAgentTokenState(): void {
  agentTokenPromise = null
  agentTokenFailureEmitted = false
}

/**
 * Lazily fetch the kc-agent token from the backend. The token is cached
 * in localStorage so subsequent calls (and page reloads) don't re-fetch.
 *
 * On Netlify / demo mode there is no kc-agent backend, so we skip the
 * fetch entirely to avoid 404 → HTML parse errors that pollute GA4
 * (#10643, root cause of the 48-hour blank dashboard in #10398).
 */
function getAgentToken(): Promise<string> {
  if (isDemoMode() || isNetlifyDeployment || isLocalAgentSuppressed()) return Promise.resolve('')

  const cached = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  if (cached) return Promise.resolve(cached)

  if (!agentTokenPromise) {
    agentTokenPromise = fetch('/api/agent/token', {
      credentials: 'include',
      signal: AbortSignal.timeout(AGENT_TOKEN_FETCH_TIMEOUT_MS),
    })
      .then(r => r.ok ? r.json() : { token: '' })
      .then((data: { token?: string }) => {
        const token = data.token || ''
        if (token) {
          localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, token)
        } else if (!agentTokenFailureEmitted) {
          agentTokenFailureEmitted = true
          emitAgentTokenFailure('empty token from /api/agent/token')
        }
        agentTokenPromise = null
        return token
      })
      .catch((err) => {
        if (!agentTokenFailureEmitted) {
          agentTokenFailureEmitted = true
          emitAgentTokenFailure(err?.message || 'network error')
        }
        agentTokenPromise = null
        return ''
      })
  }
  return agentTokenPromise
}

/**
 * Drop-in replacement for `fetch()` that auto-injects the KC_AGENT_TOKEN
 * Authorization header when calling the kc-agent HTTP API. Without this,
 * requests to kc-agent are rejected when KC_AGENT_TOKEN is configured.
 */
export async function agentFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Check if we're calling the local agent (127.0.0.1:8585)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const isLocalAgent = url.includes('127.0.0.1:8585') || url.includes('localhost:8585')
  
  // Skip token fetch for local agent in dev mode to avoid 5-second timeout
  // that causes cluster health checks to fail (#11120)
  const token = isLocalAgent ? '' : await getAgentToken()
  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  // #10000 — CSRF defence-in-depth: state-changing requests must carry a
  // custom header that browsers never attach to cross-origin form POSTs.
  // The kc-agent requireCSRF middleware rejects POST/PUT/DELETE/PATCH
  // without this header.
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }
  // Use caller-provided signal, or fall back to a default timeout
  const signal = init?.signal ?? AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS)
  return fetch(input, { ...init, headers, signal })
}

// ============================================================================
// Shared Cluster State - ensures all useClusters() consumers see the same data
// ============================================================================
//
// NOTE (#7865): the cache is internally split into two slices so that heavy
// cluster-data updates can be wrapped in React.startTransition() (interruptible,
// yielding to SPA navigation) while small UI-indicator updates stay urgent
// (so the refresh spinner on the logo reliably paints on → off). See the
// `dataSubscribers` / `uiSubscribers` split below.
//
// The public `ClusterCache` shape is kept as a single merged object so all
// existing consumers (`useClusters()`, `clusterCache.clusters.find(...)`, etc.)
// continue to work unchanged.
export interface ClusterCache {
  // --- Data slice (heavy; notified inside startTransition) ---
  clusters: ClusterInfo[]
  lastUpdated: Date | null
  consecutiveFailures: number
  isFailed: boolean
  // --- UI slice (tiny; notified urgently, outside startTransition) ---
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastRefresh: Date | null
}

/** Fields that belong to the heavy data slice. Source of truth for the split. */
const DATA_FIELDS: ReadonlyArray<keyof ClusterCache> = [
  'clusters',
  'lastUpdated',
  'consecutiveFailures',
  'isFailed',
]

/** Fields that belong to the tiny UI-indicator slice. */
const UI_FIELDS: ReadonlyArray<keyof ClusterCache> = [
  'isLoading',
  'isRefreshing',
  'error',
  'lastRefresh',
]

function updatesTouchData(updates: Partial<ClusterCache>): boolean {
  for (const field of DATA_FIELDS) {
    if (field in updates) return true
  }
  return false
}

function updatesTouchUI(updates: Partial<ClusterCache>): boolean {
  for (const field of UI_FIELDS) {
    if (field in updates) return true
  }
  return false
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
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveClusterCacheToStorage(clusters: ClusterInfo[]) {
  try {
    // Only save clusters with meaningful data.
    // Filter out clusters whose name contains a slash — these are auto-generated
    // OpenShift context names (e.g. "default/api-*.openshiftapps.com:6443/kube:admin")
    // that should not pollute the persistent cache.
    const toSave = clusters.filter(c => c.name && !c.name.includes('/')).map(c => ({
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
      authMethod: c.authMethod,
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
      // Helper: prefer new value when defined (including zero); only fall back
      // to cached when the new value is truly missing (undefined).
      // A legitimate zero (e.g. cluster scaled to 0 pods) must be respected.
      const pickMetric = (newVal: number | undefined, cachedVal: number | undefined) => {
        if (newVal !== undefined) return newVal
        return cachedVal
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
        authMethod: cluster.authMethod || cached.authMethod,
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

// Seed the standalone clusterCacheRef at module init
setClusterCacheRefClusters(storedClusters)

// Subscribers that get notified when cluster state changes.
// Split into two sets (#7865):
//  - dataSubscribers: notified inside React.startTransition(), so navigation
//    can pre-empt the heavy re-render that a new cluster list triggers.
//  - uiSubscribers: notified urgently (outside startTransition) so the
//    refresh-spinner / loading flags always commit and paint immediately.
type ClusterSubscriber = (cache: ClusterCache) => void
export const dataSubscribers = new Set<ClusterSubscriber>()
export const uiSubscribers = new Set<ClusterSubscriber>()

/**
 * Back-compat alias for the pre-split single subscriber set. Subscribers
 * added here receive BOTH data and UI updates (same as the old behavior),
 * but the notification path still honors the split (startTransition for
 * data, urgent for UI). New code should prefer `dataSubscribers` or
 * `uiSubscribers` directly, or the `subscribeClusterCache*` helpers below.
 */
export const clusterSubscribers: Set<ClusterSubscriber> = new Set<ClusterSubscriber>()

/** Notify only data subscribers, wrapped in startTransition (interruptible). */
export function notifyClusterDataSubscribers() {
  const snapshot = clusterCache
  startTransition(() => {
    Array.from(dataSubscribers).forEach(subscriber => subscriber(snapshot))
  })
}

/** Notify only UI subscribers, urgently (outside startTransition). */
export function notifyClusterUISubscribers() {
  const snapshot = clusterCache
  Array.from(uiSubscribers).forEach(subscriber => subscriber(snapshot))
}

/**
 * Back-compat: notify every legacy subscriber exactly once. Legacy
 * subscribers (added to `clusterSubscribers`) receive both data and UI
 * updates on a single call, so we fire them here — NOT inside
 * `notifyClusterDataSubscribers` / `notifyClusterUISubscribers`, which
 * would double-notify them whenever both slices change. Data-subscriber
 * notification still goes through `startTransition` via the split APIs.
 *
 * Used by code paths that mutate the cache directly (not via
 * updateClusterCache) — see `updateSingleClusterInCache`,
 * `refreshSingleCluster`, HMR reset, and mode-transition / demo-toggle
 * handlers.
 */
export function notifyClusterSubscribers() {
  const snapshot = clusterCache
  // Urgent leg — UI subscribers + legacy (merged) subscribers.
  Array.from(uiSubscribers).forEach(subscriber => subscriber(snapshot))
  Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
  // Interruptible leg — only the heavy-data subscribers.
  startTransition(() => {
    Array.from(dataSubscribers).forEach(subscriber => subscriber(snapshot))
  })
}

/**
 * Clear all cluster caches on logout so data from a previous user session
 * does not leak to the next login (#5405). Clears both localStorage keys
 * and the module-level in-memory cache, then notifies subscribers so the
 * UI resets to a loading/empty state.
 */
export function clearClusterCacheOnLogout(): void {
  try {
    localStorage.removeItem(CLUSTER_CACHE_KEY)
    localStorage.removeItem(CLUSTER_DIST_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }

  Object.assign(clusterCache, {
    clusters: [],
    lastUpdated: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    consecutiveFailures: 0,
    isFailed: false,
    lastRefresh: null,
  })
  notifyClusterSubscribers()
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
      Object.assign(clusterCache, {
        clusters: getDemoClusters(),
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        isFailed: false,
        lastRefresh: new Date(),
      })
      notifyClusterSubscribers()
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
    Object.assign(clusterCache, {
      clusters: [],
      lastUpdated: null,
      isLoading: true, // Triggers skeleton display
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })
    notifyClusterSubscribers()
  })
}

// Debounced notification for batching rapid updates (prevents flashing during health checks).
// This path is used by `updateSingleClusterInCache`, which mutates the heavy
// `clusters` array, so we dispatch to DATA subscribers inside startTransition.
// Legacy merged subscribers also receive the update (urgent) so the
// pre-split contract is preserved.
let notifyTimeout: ReturnType<typeof setTimeout> | null = null
export function notifyClusterSubscribersDebounced() {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout)
  }
  notifyTimeout = setTimeout(() => {
    const snapshot = clusterCache
    Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
    notifyClusterDataSubscribers()
    notifyTimeout = null
  }, CLUSTER_NOTIFY_DEBOUNCE_MS)
}

// Update shared cluster cache
export function updateClusterCache(updates: Partial<ClusterCache>) {
  const hadClusters = clusterCache.clusters.length > 0

  // Apply cached distributions and merge with stored data to preserve metrics
  if (updates.clusters) {
    updates.clusters = mergeWithStoredClusters(updates.clusters)
    updates.clusters = applyDistributionCache(updates.clusters)
    // Save cluster data to localStorage
    saveClusterCacheToStorage(updates.clusters)
    updateDistributionCache(updates.clusters)
  }
  // Mutate in place so that any module holding a reference to the exported
  // `clusterCache` object sees the update (ESM live-binding of `let` exports
  // is not preserved by all bundlers / test runners).
  Object.assign(clusterCache, updates)

  // Keep the standalone clusterCacheRef in sync (breaks circular import)
  if (updates.clusters) {
    setClusterCacheRefClusters(clusterCache.clusters)
  }

  // Route notifications based on which slice the updates touch (#7865).
  // UI fires first (urgent) so spinner on/off commits immediately, then
  // data fires inside startTransition so navigation can pre-empt the
  // heavy re-render caused by a new cluster list.
  const touchesUI = updatesTouchUI(updates)
  const touchesData = updatesTouchData(updates)
  if (touchesUI) {
    notifyClusterUISubscribers()
  }
  if (touchesData) {
    notifyClusterDataSubscribers()
  }
  // Legacy merged subscribers are fired exactly once per updateClusterCache
  // call so the pre-split contract (one notify per update) is preserved.
  if (touchesUI || touchesData) {
    const snapshot = clusterCache
    Array.from(clusterSubscribers).forEach(subscriber => subscriber(snapshot))
  } else {
    // If the updates somehow touch neither slice, fall back to notifying
    // every subscriber so nothing gets silently dropped.
    notifyClusterSubscribers()
  }

  // When clusters become available for the first time, reset all cache
  // failures and trigger immediate refetch. This fixes the race condition
  // where hooks fire before WebSocket delivers cluster data, fail, and
  // enter exponential backoff — leaving cards empty even after clusters load.
  if (!hadClusters && clusterCache.clusters.length > 0) {
    resetAllCacheFailures()
    triggerAllRefetches()
  }
}

// Share metrics between clusters pointing to the same server
// This handles cases where short-named aliases (e.g., "prow") point to the same
// server as full-context clusters that have metric data
export function shareMetricsBetweenSameServerClusters(clusters: ClusterInfo[]): ClusterInfo[] {
  // Build a map of server -> clusters with metrics
  const serverMetrics = new Map<string, ClusterInfo>()

  // First pass: find clusters that have metrics for each server
  for (const cluster of (clusters || [])) {
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

  for (const cluster of (clusters || [])) {
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

  for (const [__server, group] of serverGroups) {
    if (group.length === 1) {
      // No duplicates, just add the cluster
      deduplicatedClusters.push({ ...group[0], aliases: [] })
      continue
    }

    // Multiple clusters point to same server - select primary and merge
    // Priority: 1) User-friendly name, 2) Has metrics, 3) Has more namespaces, 4) Current context, 5) Shorter name

    // Helper to detect OpenShift-generated long context names
    // These typically look like: "default/api-something.openshiftapps.com:6443/kube:admin"
    // Use regex anchored to hostname boundaries to avoid substring-bypass (CodeQL #9119).
    const OPENSHIFT_CONTEXT_RE = /(?:^|\/)(?:[^/]*\.)?openshiftapps\.com(?:[:/]|$)|(?:^|\/)(?:[^/]*\.)?openshift\.com(?:[:/]|$)/
    const isAutoGeneratedName = (name: string): boolean => {
      return name.includes('/api-') ||
             name.includes(':6443/') ||
             name.includes(':443/') ||
             OPENSHIFT_CONTEXT_RE.test(name) ||
             (name.includes('/') && name.includes(':') && name.length > AUTO_GENERATED_NAME_LENGTH_THRESHOLD)
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

    // Merge the best metrics from all duplicates.
    //
    // nodeCount and podCount are counts of live resources — NOT "max across all
    // observations". Previously we took Math.max, which over-counted after a
    // scale-down because the larger stale value from a previous sample kept
    // winning (issue #6112). Instead, prefer the primary cluster's current
    // values and only fall back to an alias value when the primary hasn't
    // reported yet (nodeCount/podCount undefined). This gives us the freshest
    // authoritative count without resurrecting stale numbers.
    let bestMetrics: Partial<ClusterInfo> = {}
    for (const cluster of (group || [])) {
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
    }
    // Authoritative counts: use the primary cluster's values; only fall back to
    // an alias when the primary has no value reported at all.
    if (primary.nodeCount !== undefined) {
      bestMetrics.nodeCount = primary.nodeCount
    } else {
      const alias = group.find(c => c !== primary && c.nodeCount !== undefined)
      if (alias) bestMetrics.nodeCount = alias.nodeCount
    }
    if (primary.podCount !== undefined) {
      bestMetrics.podCount = primary.podCount
    } else {
      const alias = group.find(c => c !== primary && c.podCount !== undefined)
      if (alias) bestMetrics.podCount = alias.podCount
    }
    // Legacy merge loop preserved only for request metrics (below).
    for (const cluster of (group || [])) {
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
  for (const cluster of (noServerClusters || [])) {
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

      // For numeric metrics, only fall back to cached when new value is undefined.
      // A real zero (e.g. scaled-to-zero) must be respected — see #5443.
      // NOTE: reachability (key === 'reachable') is no longer blocked by cached
      // node data — the useMCP hook already gates reachable=false behind 5 minutes
      // of consecutive failures, so the value is authoritative — see #5444.

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

  Object.assign(clusterCache, { clusters: updatedClusters })
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

  // Playwright nightly runs the built bundle against `vite preview` (port 4173)
  // with no backend — so /ws has no listener. Firefox's retry behavior on the
  // failed connection cascades into NS_BINDING_ABORTED on subsequent page.goto
  // calls. All Playwright/Selenium-class drivers set navigator.webdriver=true.
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
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
    const wsUrl = `${protocol}//${window.location.host}/ws`

    const ws = new WebSocket(appendWsAuthToken(wsUrl))

    ws.onopen = () => {
      // Guard against race condition where onclose fires before onopen
      // (observed in Safari and during rapid reconnection cycles).
      // ws.readyState may no longer be OPEN by the time this handler runs.
      if (ws.readyState !== WebSocket.OPEN) {
        return
      }
      // Send authentication message - backend requires this within 5 seconds
      const token = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
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
    Object.assign(clusterCache, {
      clusters: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })
    clusterSubscribers.clear()
    dataSubscribers.clear()
    uiSubscribers.clear()
  })
}

/** Storage key used by useKagentBackend to persist the preferred backend. */
const BACKEND_PREF_KEY = 'kc_agent_backend_preference'

/** Read the preferred agent backend from localStorage (non-React). */
function getPreferredBackend(): string {
  try {
    return localStorage.getItem(BACKEND_PREF_KEY) || 'kc-agent'
  } catch {
    return 'kc-agent'
  }
}

/**
 * Fetch cluster list from the backend API (/api/mcp/clusters).
 * This endpoint works independently of kc-agent — it uses the MCP bridge or
 * direct k8s client, making it the right choice when kagenti/kagent is active. (#9535)
 */
async function fetchClusterListFromBackendAPI(): Promise<ClusterInfo[] | null> {
  try {
    const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
    if (data?.clusters) {
      reportAgentDataSuccess()
      return data.clusters
    }
  } catch {
    // Backend API unavailable
  }
  return null
}

// Fetch basic cluster list from local agent (fast, no health check)
async function fetchClusterListFromAgent(): Promise<ClusterInfo[] | null> {
  // On Netlify deployments (isNetlifyDeployment), skip agent entirely — there is
  // no local agent and the request would fail with CORS errors.
  // On localhost, always attempt to reach the agent — it may be running even if
  // AgentManager has not detected it yet.
  if (isNetlifyDeployment) return null

  // When kagenti or kagent is the preferred backend, fetch clusters from the
  // backend API (/api/mcp/clusters) which works independently of kc-agent.
  // kc-agent's /clusters endpoint is only available when kc-agent is running. (#9535)
  const preferred = getPreferredBackend()
  if (preferred === 'kagenti' || preferred === 'kagent') {
    return fetchClusterListFromBackendAPI()
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MCP_PROBE_TIMEOUT_MS)
    const response = await agentFetch(`${LOCAL_AGENT_URL}/clusters`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok) {
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON response from agent')
      // Report successful data fetch - can recover from degraded state
      reportAgentDataSuccess()
      // Transform agent response to ClusterInfo format - mark as "checking" initially
      return (data.clusters || []).map((c: { name: string; context?: string; server: string; user: string; isCurrent?: boolean; authMethod?: string }) => ({
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
        authMethod: c.authMethod,
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
const OFFLINE_THRESHOLD_MS = 5 * MS_PER_MINUTE // 5 minutes before marking as offline

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
      const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
      const response = await agentFetch(`${LOCAL_AGENT_URL}/cluster-health?cluster=${encodeURIComponent(context)}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
        // before the outer try/catch processes the rejection (microtask timing issue).
        const health = await response.json().catch(() => null)
        if (!health) throw new Error('Invalid JSON from health endpoint')
        reportAgentDataSuccess()
        return health
      }
    } catch {
      // Agent HTTP failed, will try backend below
    }
  }

  // Skip backend if we've had too many consecutive failures or using demo token
  if (healthCheckFailures >= MAX_HEALTH_CHECK_FAILURES || isDemoToken()) {
    return null
  }

  // Fall back to backend API
  const agentToken = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/clusters/${encodeURIComponent(clusterName)}/health`,
      {
        signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
        headers: agentToken ? { 'Authorization': `Bearer ${agentToken}` } : {},
      }
    )
    if (response.ok) {
      healthCheckFailures = 0 // Reset on success
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const result = await response.json().catch(() => null)
      if (!result) throw new Error('Invalid JSON from cluster health endpoint')
      return result
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
// Uses parsed hostname checks (not substring matching) to prevent bypass via
// crafted URLs like evil.com/path?q=eks.amazonaws.com (CodeQL #9119).
function detectDistributionFromServer(server?: string): string | undefined {
  if (!server) return undefined

  // OpenShift patterns — check parsed hostname, not raw string
  if (hostnameEndsWith(server, 'openshiftapps.com') ||
      hostnameEndsWith(server, 'openshift.com') ||
      // IBM FMAAS OpenShift clusters (api.fmaas-*.fmaas.res.ibm.com:6443)
      hostnameContainsLabel(server, 'fmaas') ||
      // Generic OpenShift API pattern (api.*.example.com:6443) — exclude EKS/AKS
      (server.match(/^https?:\/\/api\.[^/]+:6443/) &&
       !hostnameEndsWith(server, 'eks.amazonaws.com') &&
       !hostnameEndsWith(server, 'azmk8s.io'))) {
    return 'openshift'
  }

  // EKS pattern
  if (hostnameEndsWith(server, 'eks.amazonaws.com')) {
    return 'eks'
  }

  // GKE pattern
  if (hostnameEndsWith(server, 'gke.io') || hostnameEndsWith(server, 'container.googleapis.com')) {
    return 'gke'
  }

  // AKS pattern
  if (hostnameEndsWith(server, 'azmk8s.io') || hostnameContainsLabel(server, 'hcp')) {
    return 'aks'
  }

  // OCI OKE pattern
  if (hostnameEndsWith(server, 'oraclecloud.com') || hostnameContainsLabel(server, 'oci')) {
    return 'oci'
  }

  // DigitalOcean pattern
  if (hostnameEndsWith(server, 'digitalocean.com') || hostnameEndsWith(server, 'k8s.ondigitalocean.com')) {
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
        { context: kubectlContext || clusterName, timeout: KUBECTL_MAX_TIMEOUT_MS }
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

  const agentToken = localStorage.getItem(AGENT_TOKEN_STORAGE_KEY)
  const headers: Record<string, string> = agentToken ? { 'Authorization': `Bearer ${agentToken}` } : {}

  // Helper to extract namespaces from API response
  const extractNamespaces = (items: Array<{ namespace?: string }>): string[] => {
    return Array.from(new Set<string>(
      items.map(item => item.namespace).filter((ns): ns is string => Boolean(ns))
    ))
  }

  // Try pods endpoint first
  try {
    const response = await fetch(
      `${LOCAL_AGENT_HTTP_URL}/pods?cluster=${encodeURIComponent(clusterName)}&limit=500`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0 // Reset on success
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
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
      `${LOCAL_AGENT_HTTP_URL}/events?cluster=${encodeURIComponent(clusterName)}&limit=200`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
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
      `${LOCAL_AGENT_HTTP_URL}/deployments?cluster=${encodeURIComponent(clusterName)}`,
      { signal: AbortSignal.timeout(METRICS_SERVER_TIMEOUT_MS), headers }
    )
    if (response.ok) {
      distributionDetectionFailures = 0
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON')
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
        }).catch(() => { /* non-critical — distribution detection is best-effort */ })

        updateSingleClusterInCache(cluster.name, {
          // If we have nodes, consider healthy based on actual node readiness
          // healthy: true means all nodes are ready; false means some aren't ready but cluster is reachable
          healthy: hasValidData ? health.healthy : false,
          reachable: true,  // We definitely reached the cluster if we have data
          // External reachability probe result (#4202)
          externallyReachable: health.externallyReachable,
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
          issues: health.issues,
          errorType: undefined,
          errorMessage: undefined,
          refreshing: false,
        })
      } else {
        // Cluster reported as unreachable by the agent
        recordClusterFailure(cluster.name)

        // Distinguish between definitive errors and transient timeouts.
        // A timeout means the health check took too long (large cluster, slow network)
        // but does NOT mean the cluster is genuinely unreachable.
        const errorMsg = health.errorMessage?.toLowerCase() || ''
        const isDefinitiveError = errorMsg.includes('connection refused') ||
          errorMsg.includes('connection reset') ||
          errorMsg.includes('no such host') ||
          errorMsg.includes('network is unreachable') ||
          errorMsg.includes('certificate') ||
          errorMsg.includes('unauthorized') ||
          health.errorType === 'network' ||
          health.errorType === 'certificate' ||
          health.errorType === 'auth'

        if (isDefinitiveError) {
          // Definitive error - cluster is genuinely unreachable, mark offline immediately
          updateSingleClusterInCache(cluster.name, {
            healthy: false,
            reachable: false,
            nodeCount: 0,
            errorType: health.errorType,
            errorMessage: health.errorMessage,
            refreshing: false,
          })
        } else if (shouldMarkOffline(cluster.name)) {
          // Transient errors (timeout) persisting for 5+ minutes - now mark offline
          updateSingleClusterInCache(cluster.name, {
            healthy: false,
            reachable: false,
            nodeCount: 0,
            errorType: health.errorType,
            errorMessage: health.errorMessage,
            refreshing: false,
          })
        } else {
          // Transient failure (timeout) - keep existing cached values
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
const HEALTH_CHECK_CONCURRENCY = 6

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
      // Skip clusters being manually refreshed to avoid race conditions
      if (cluster.refreshing) {
        completed++
        continue
      }
      const key = cluster.name
      inProgress.add(key)

      // Don't await here - let multiple run in parallel
      processClusterHealth(cluster)
        .catch(() => { /* health check errors are non-fatal — cluster stays in existing state */ })
        .finally(() => {
          inProgress.delete(key)
          completed++
          // Start next one immediately when one finishes
          if (queue.length > 0) {
            processNext().catch(() => { /* ignore — errors already handled per-cluster */ })
          }
        })
    }
  }

  // Start initial batch up to concurrency limit
  const initialBatch = Math.min(HEALTH_CHECK_CONCURRENCY, clusterList.length)
  for (let i = 0; i < initialBatch; i++) {
    processNext().catch(() => { /* ignore — errors already handled per-cluster */ })
  }

  // Wait for all to complete (non-blocking check)
  while (completed < clusterList.length) {
    await new Promise(resolve => setTimeout(resolve, FOCUS_DELAY_MS))
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

  // Historical note: this function used to short-circuit to getDemoClusters()
  // whenever isDemoMode() returned true. That broke in-cluster deployments in
  // two ways:
  //   1) PR #6215 gated the short-circuit on `!isInClusterMode() || !hasRealToken()`,
  //      but hasRealToken() is false for any session running under a demo token,
  //      so Create Namespace still listed demo clusters when demo mode was
  //      toggled on (which is the exact bug report).
  //   2) PR #6233 relaxed it to `!isInClusterMode()` only, but that still fires
  //      on the FIRST call at page load because `isInClusterMode()` reads from
  //      backendHealthManager, whose initial state is `{status: 'connecting',
  //      inCluster: false}` — the real value is only known after /health
  //      responds. The early return therefore races the health check and
  //      persists demo clusters into the shared cache.
  //
  // Fix: drop the early-return entirely. The downstream fallback at
  // `isDemoMode() && isDemoToken()` (after fetchClusterListFromAgent fails)
  // already handles the "demo mode with demo token" case correctly, and real
  // backends will happily return live clusters even when the demo-mode toggle
  // is set. Netlify-forced demo mode is handled by the isNetlifyDeployment
  // block below, so forced-demo deploys still skip the live fetch entirely.
  // On forced demo mode deployments (Netlify), skip fetching entirely to avoid flicker.
  // Demo data is already in the initial cache state, so no loading indicators needed.
  if (isNetlifyDeployment) {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
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

  // Helper to ensure minimum visible duration for refresh animation.
  // On initial load (no cached data), skip the delay — show data ASAP.
  // On refresh (cached data visible), enforce minimum so indicator is readable.
  const finishWithMinDuration = async (updates: Partial<typeof clusterCache>) => {
    if (hasCachedData) {
      const elapsed = Date.now() - startTime
      const minDuration = MIN_REFRESH_INDICATOR_MS
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed))
      }
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
      // Store the full (raw) cluster list in the cache. Deduplication is
      // handled lazily by the useClusters() hook's `deduplicatedClusters`
      // computed property. Premature dedup here was the root cause of
      // #10316: when many kubeconfig contexts shared server URLs, the
      // cache only held the dedup winners — hiding legitimate clusters
      // (including the active kubectl context) from the dashboard.

      // Show clusters immediately with preserved health data
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
      // Reset flag before returning - allows subsequent refresh calls
      fetchInProgress = false
      // Check health on deduplicated clusters to avoid redundant probes
      // against the same physical server from multiple contexts
      const healthCheckClusters = deduplicateClustersByServer(mergedClusters)
      checkHealthProgressively(healthCheckClusters)
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
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) {
      await finishWithMinDuration({ isLoading: false, isRefreshing: false })
      return
    }

    // Fall back to backend API (/api/mcp/clusters works regardless of agent backend)
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
    // Check health on deduplicated clusters to avoid redundant probes
    // against the same physical server from multiple contexts
    const healthCheckClusters = deduplicateClustersByServer(data.clusters || [])
    checkHealthProgressively(healthCheckClusters)
  } catch {
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

  // Mark the cluster as refreshing immediately and clear stale error state
  // so it shows as "loading" instead of "offline" while fetching
  Object.assign(clusterCache, {
    clusters: clusterCache.clusters.map(c =>
      c.name === clusterName ? { ...c, refreshing: true, reachable: undefined, errorType: undefined, errorMessage: undefined } : c
    ),
  })
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
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, cpuRequestsCores: 2.1, memoryRequestsGB: 5, distribution: 'kind' },
    { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, cpuRequestsCores: 0.8, memoryRequestsGB: 2, distribution: 'minikube' },
    { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, cpuRequestsCores: 3.5, memoryRequestsGB: 7, distribution: 'k3s' },
    { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, cpuRequestsCores: 62, memoryRequestsGB: 245, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
    { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, cpuRequestsCores: 18, memoryRequestsGB: 72, distribution: 'gke' },
    { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, cpuRequestsCores: 11, memoryRequestsGB: 48, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
    { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, cpuRequestsCores: 54, memoryRequestsGB: 210, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift', namespaces: ['openshift-operators', 'openshift-monitoring'] },
    { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, cpuRequestsCores: 22, memoryRequestsGB: 88, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
    { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, cpuRequestsCores: 38, memoryRequestsGB: 154, distribution: 'alibaba' },
    { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, cpuRequestsCores: 5, memoryRequestsGB: 22, distribution: 'digitalocean' },
    { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, cpuRequestsCores: 14, memoryRequestsGB: 58, distribution: 'rancher' },
    { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, cpuRequestsCores: 192, memoryRequestsGB: 1536, distribution: 'kubernetes' },
  ]
}

// Re-exported from clusterCacheRef.ts for backward compatibility
export { clusterCacheRef }

// Subscribe to cluster cache changes (for modules that need reactive updates).
// Back-compat API: receives BOTH data and UI updates. Prefer the split
// variants below for new code.
export function subscribeClusterCache(callback: (cache: ClusterCache) => void): () => void {
  clusterSubscribers.add(callback)
  return () => clusterSubscribers.delete(callback)
}

/** Subscribe to heavy cluster-data updates only (notifications are interruptible). */
export function subscribeClusterData(callback: (cache: ClusterCache) => void): () => void {
  dataSubscribers.add(callback)
  return () => dataSubscribers.delete(callback)
}

/** Subscribe to tiny UI-indicator updates only (notifications are urgent). */
export function subscribeClusterUI(callback: (cache: ClusterCache) => void): () => void {
  uiSubscribers.add(callback)
  return () => uiSubscribers.delete(callback)
}

// Getter/setter functions for module-level state (vitest CJS transform does
// not preserve ESM live bindings for `let` exports, so tests must use these
// functions instead of reading the exported variable directly).
export function setInitialFetchStarted(value: boolean) {
  initialFetchStarted = value
}

export function getInitialFetchStarted(): boolean {
  return initialFetchStarted
}

export function setHealthCheckFailures(value: number) {
  healthCheckFailures = value
}

export function getHealthCheckFailures(): number {
  return healthCheckFailures
}

// ============================================================================
// fetchWithRetry — Retry wrapper for transient failures (#3258)
// Retries on network errors and 5xx responses with exponential backoff.
// ============================================================================

/** Options for fetchWithRetry */
export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 2, so 3 total attempts) */
  maxRetries?: number
  /** Initial backoff delay in ms (default: 500). Doubles on each retry. */
  initialBackoffMs?: number
  /** Timeout per attempt in ms (default: MCP_HOOK_TIMEOUT_MS) */
  timeoutMs?: number
}

/**
 * Returns true for errors that are worth retrying: network failures and timeouts.
 */
function isTransientError(error: unknown): boolean {
  // Network error (fetch throws TypeError on network failure)
  if (error instanceof TypeError) return true
  // AbortError from timeout — worth retrying
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return false
}

/**
 * Fetch with automatic retry on transient failures.
 *
 * Retries when:
 * - The fetch itself throws (network error, DNS failure, timeout)
 * - The server returns a 5xx status code
 *
 * Does NOT retry on:
 * - 4xx errors (client errors — retrying won't help)
 * - Successful responses (2xx/3xx)
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = 2,
    initialBackoffMs = 500,
    timeoutMs = MCP_HOOK_TIMEOUT_MS,
    ...fetchOptions
  } = options

  let lastError: unknown
  const totalAttempts = maxRetries + 1

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // Named handler so we can remove it after fetch completes (#4772)
    const onCallerAbort = () => controller.abort()
    if (fetchOptions.signal) {
      fetchOptions.signal.addEventListener('abort', onCallerAbort)
    }

    try {
      const response = await agentFetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      // Don't retry on 4xx — those are permanent client errors
      if (response.status >= 400 && response.status < 500) {
        return response
      }

      // Retry on 5xx server errors (unless this is the last attempt)
      if (response.status >= 500 && attempt < totalAttempts - 1) {
        lastError = new Error(`Server error: ${response.status}`)
        const backoff = initialBackoffMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, backoff))
        continue
      }

      return response
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      lastError = err
      // Only retry on transient errors
      if (!isTransientError(err) || attempt >= totalAttempts - 1) {
        throw err
      }
      const backoff = initialBackoffMs * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, backoff))
    } finally {
      // Remove abort listener to prevent accumulation (#4772)
      if (fetchOptions.signal) {
        fetchOptions.signal.removeEventListener('abort', onCallerAbort)
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError
}

/** Shorten a cluster name for display — strips context prefix, truncates long names */
export function clusterDisplayName(name: string): string {
  const parts = name.split('/')
  const base = parts[parts.length - 1]
  if (base.length > 24) {
    const segments = base.split(/[-_.]/)
    if (segments.length > 2) return segments.slice(0, 3).join('-')
    return base.slice(0, 22) + '…'
  }
  return base
}

export const __testables = {
  detectDistributionFromNamespaces,
  detectDistributionFromServer,
  updatesTouchData,
  updatesTouchUI,
  applyDistributionCache,
}
