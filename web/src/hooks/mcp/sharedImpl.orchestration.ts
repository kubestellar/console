// Main cluster fetch orchestration and refresh logic

import { api } from '../../lib/api'
import { isDemoMode, isDemoToken, isNetlifyDeployment } from '../../lib/demoMode'
import { resetFailuresForCluster } from '../../lib/cache'
import { getStoredAuthToken } from '../../lib/authToken'
import { deduplicateClustersByServer } from './clusterUtils'
import { getDemoClusters } from './sharedImpl.demo'
import { fetchClusterListFromAgent } from './sharedImpl.fetching'
import { checkHealthProgressively, fetchSingleClusterHealth, clearClusterFailure, shouldMarkOffline, recordClusterFailure } from './sharedImpl.health'
import { MIN_REFRESH_INDICATOR_MS } from './sharedImpl.constants'
import { clusterCache, updateClusterCache, updateSingleClusterInCache, notifyClusterSubscribers } from './sharedImpl.state'
import { getLiveClustersForFallback } from './sharedImpl.persistence'
import type { ClusterInfo } from './types'

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
    const token = getStoredAuthToken()
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
    const token = getStoredAuthToken()
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
    const newFailures = clusterCache.consecutiveFailures + 1
    const fallbackClusters = isDemoMode()
      ? (clusterCache.clusters.some(cluster => cluster.isDemo) ? clusterCache.clusters : getDemoClusters())
      : getLiveClustersForFallback(clusterCache.clusters)

    await finishWithMinDuration({
      error: null,
      clusters: fallbackClusters,
      isLoading: false,
      isRefreshing: false,
      consecutiveFailures: newFailures,
      isFailed: false,
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
