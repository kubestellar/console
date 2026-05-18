// Barrel file for sharedImpl - re-exports all sub-modules for backwards compatibility

// ===== Constants =====
export {
  REFRESH_INTERVAL_MS,
  CLUSTER_POLL_INTERVAL_MS,
  GPU_POLL_INTERVAL_MS,
  CACHE_TTL_MS,
  getEffectiveInterval,
  CLUSTER_NOTIFY_DEBOUNCE_MS,
  MIN_REFRESH_INDICATOR_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  MAX_HEALTH_CHECK_FAILURES,
  MAX_DISTRIBUTION_FAILURES,
  HEALTH_CHECK_CONCURRENCY,
  WS_BACKEND_RECHECK_INTERVAL,
} from './sharedImpl.constants'

// ===== Types =====
export type {
  ClusterCache,
  ClusterSubscriber,
  ClusterInfo,
  ClusterHealth,
} from './sharedImpl.types'
export {
  DATA_FIELDS,
  UI_FIELDS,
  updatesTouchData,
  updatesTouchUI,
} from './sharedImpl.types'

// ===== State Management =====
export {
  clusterCache,
  dataSubscribers,
  uiSubscribers,
  clusterSubscribers,
  notifyClusterDataSubscribers,
  notifyClusterUISubscribers,
  notifyClusterSubscribers,
  notifyClusterSubscribersDebounced,
  clearClusterCacheOnLogout,
  updateClusterCache,
  updateSingleClusterInCache,
  subscribeClusterCache,
  subscribeClusterData,
  subscribeClusterUI,
  initialFetchStarted,
  setInitialFetchStarted,
  getInitialFetchStarted,
} from './sharedImpl.state'

// ===== Connection Management =====
export {
  sharedWebSocket,
  connectSharedWebSocket,
  cleanupSharedWebSocket,
  setFullFetchClustersImpl,
} from './sharedImpl.connection'

// ===== Data Fetching =====
export {
  fetchClusterListFromBackendAPI,
  fetchClusterListFromAgent,
} from './sharedImpl.fetching'

// ===== Health Checking =====
export {
  healthCheckFailures,
  shouldMarkOffline,
  recordClusterFailure,
  clearClusterFailure,
  fetchSingleClusterHealth,
  detectClusterDistribution,
  checkHealthProgressively,
  setHealthCheckFailures,
  getHealthCheckFailures,
} from './sharedImpl.health'

// ===== Orchestration =====
export {
  fullFetchClusters,
  refreshSingleCluster,
} from './sharedImpl.orchestration'

// ===== Demo Data =====
export {
  getDemoClusters,
} from './sharedImpl.demo'

// ===== Utilities =====
// fetchWithRetry — extracted to ./fetchWithRetry
export type { FetchWithRetryOptions } from './fetchWithRetry'
export { fetchWithRetry } from './fetchWithRetry'

// clusterUtils — extracted cluster utility functions
export { shareMetricsBetweenSameServerClusters, deduplicateClustersByServer, detectDistributionFromNamespaces, detectDistributionFromServer } from './clusterUtils'

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

// ===== Test Exports =====
import { applyDistributionCache } from './sharedImpl.persistence'
import { detectDistributionFromNamespaces, detectDistributionFromServer } from './clusterUtils'
import { updatesTouchData as updatesTouchDataInternal, updatesTouchUI as updatesTouchUIInternal } from './sharedImpl.types'

export const __testables = {
  detectDistributionFromNamespaces,
  detectDistributionFromServer,
  updatesTouchData: updatesTouchDataInternal,
  updatesTouchUI: updatesTouchUIInternal,
  applyDistributionCache,
}

// ===== Wire up cross-module dependencies =====
// The orchestration module needs fullFetchClusters, so we import and set it
import { fullFetchClusters as fullFetchClustersFunc } from './sharedImpl.orchestration'
import { setFullFetchClustersImpl } from './sharedImpl.connection'
setFullFetchClustersImpl(fullFetchClustersFunc)

// ===== HMR Support =====
import { clusterCache as clusterCacheRef, dataSubscribers as dataSubscribersRef, uiSubscribers as uiSubscribersRef, clusterSubscribers as clusterSubscribersRef, setInitialFetchStarted as setInitialFetchStartedFunc } from './sharedImpl.state'
import { cleanupSharedWebSocket as cleanupSharedWebSocketFunc } from './sharedImpl.connection'
import { setHealthCheckFailures } from './sharedImpl.health'

// Reset shared state on HMR (hot module reload) in development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    setInitialFetchStartedFunc(false)
    setHealthCheckFailures(0) // Reset health check failures on HMR
    cleanupSharedWebSocketFunc()
    Object.assign(clusterCacheRef, {
      clusters: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    })
    clusterSubscribersRef.clear()
    dataSubscribersRef.clear()
    uiSubscribersRef.clear()
  })
}
