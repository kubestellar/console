/**
 * Cluster cache persistence layer — localStorage read/write operations.
 * Extracted from sharedImpl.ts to reduce file size (#14496).
 */
import { isDemoMode } from '../../lib/demoMode'
import { detectDistributionFromServer } from './clusterUtils'
import type { ClusterInfo } from './types'

// Cache cluster distribution in localStorage to prevent logo flickering on page load
export const CLUSTER_DIST_CACHE_KEY = 'kubestellar-cluster-distributions'
type DistributionCache = Record<string, { distribution: string; namespaces?: string[] }>

export function loadDistributionCache(): DistributionCache {
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

export function saveDistributionCache(cache: DistributionCache) {
  try {
    localStorage.setItem(CLUSTER_DIST_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage errors
  }
}

// Apply cached distributions to cluster list
// Falls back to URL-based detection for unreachable clusters
export function applyDistributionCache(clusters: ClusterInfo[]): ClusterInfo[] {
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
export function updateDistributionCache(clusters: ClusterInfo[]) {
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
export const CLUSTER_CACHE_KEY = 'kubestellar-cluster-cache'
const KNOWN_DEMO_CLUSTER_NAMES = new Set([
  'kind-local',
  'minikube',
  'k3s-edge',
  'eks-prod-us-east-1',
  'gke-staging',
  'aks-dev-westeu',
  'openshift-prod',
  'oci-oke-phoenix',
  'alibaba-ack-shanghai',
  'do-nyc1-prod',
  'rancher-mgmt',
  'vllm-gpu-cluster',
])
const DISTINCTIVE_DEMO_CLUSTER_NAMES = new Set([
  'eks-prod-us-east-1',
  'gke-staging',
  'aks-dev-westeu',
  'openshift-prod',
  'oci-oke-phoenix',
  'alibaba-ack-shanghai',
  'do-nyc1-prod',
  'rancher-mgmt',
  'vllm-gpu-cluster',
])

export function looksLikePersistedDemoClusterCache(clusters: ClusterInfo[]): boolean {
  return clusters.length > 0 &&
    clusters.some(cluster => cluster.isDemo || DISTINCTIVE_DEMO_CLUSTER_NAMES.has(cluster.name)) &&
    clusters.every(cluster => cluster.isDemo || KNOWN_DEMO_CLUSTER_NAMES.has(cluster.name))
}

export function getLiveClustersForFallback(clusters: ClusterInfo[]): ClusterInfo[] {
  if (looksLikePersistedDemoClusterCache(clusters)) {
    return []
  }
  return clusters.filter(cluster => !cluster.isDemo)
}

export function loadClusterCacheFromStorage(): ClusterInfo[] {
  try {
    const stored = localStorage.getItem(CLUSTER_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (!isDemoMode() && looksLikePersistedDemoClusterCache(parsed)) {
          localStorage.removeItem(CLUSTER_CACHE_KEY)
          return []
        }
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

export function saveClusterCacheToStorage(clusters: ClusterInfo[]) {
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
      isDemo: c.isDemo,
    }))
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(toSave))
  } catch {
    // Ignore storage errors
  }
}

// Merge stored cluster data with fresh cluster list (preserves cached metrics)
// Uses cached value when new value is missing/zero (0 is treated as missing for metrics)
export function mergeWithStoredClusters(newClusters: ClusterInfo[]): ClusterInfo[] {
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
