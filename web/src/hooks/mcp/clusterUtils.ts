import { hostnameEndsWith, hostnameContainsLabel } from '../../lib/utils/urlHostname'
import type { ClusterInfo } from './types'

/** Name length above which a cluster context name is considered auto-generated */
const AUTO_GENERATED_NAME_LENGTH_THRESHOLD = 50

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
    // Priority: 1) Reachable, 2) User-friendly name, 3) Has metrics, 4) Has more namespaces, 5) Current context, 6) Shorter name

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
      // (#11145) Prefer reachable context as primary — if the primary is unreachable
      // but an alias is reachable, kubectl operations would silently target the
      // unusable context. Sorting reachable contexts first ensures the deduplicated
      // cluster's name refers to a context that can actually serve kubectl requests.
      const aReachable = a.reachable === true
      const bReachable = b.reachable === true
      if (aReachable && !bReachable) return -1
      if (!aReachable && bReachable) return 1

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
          cpuUsageMillicores: cluster.cpuUsageMillicores,
          cpuUsageCores: cluster.cpuUsageCores,
          memoryUsageBytes: cluster.memoryUsageBytes,
          memoryUsageGB: cluster.memoryUsageGB,
          metricsAvailable: cluster.metricsAvailable,
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
    // Legacy merge loop: fill in request/usage metrics that may come from a
    // different cluster context than the one that reported capacity.
    for (const cluster of (group || [])) {
      // Merge request metrics — non-zero wins (0 means "not reported")
      if (cluster.cpuRequestsCores && !bestMetrics.cpuRequestsCores) {
        bestMetrics.cpuRequestsMillicores = cluster.cpuRequestsMillicores
        bestMetrics.cpuRequestsCores = cluster.cpuRequestsCores
      }
      if (cluster.memoryRequestsGB && !bestMetrics.memoryRequestsGB) {
        bestMetrics.memoryRequestsBytes = cluster.memoryRequestsBytes
        bestMetrics.memoryRequestsGB = cluster.memoryRequestsGB
      }
      // Merge usage metrics — non-zero wins (0 means "not reported")
      if (cluster.cpuUsageCores && !bestMetrics.cpuUsageCores) {
        bestMetrics.cpuUsageMillicores = cluster.cpuUsageMillicores
        bestMetrics.cpuUsageCores = cluster.cpuUsageCores
      }
      if (cluster.memoryUsageGB && !bestMetrics.memoryUsageGB) {
        bestMetrics.memoryUsageBytes = cluster.memoryUsageBytes
        bestMetrics.memoryUsageGB = cluster.memoryUsageGB
      }
      // Merge metricsAvailable flag
      if (cluster.metricsAvailable && !bestMetrics.metricsAvailable) {
        bestMetrics.metricsAvailable = cluster.metricsAvailable
      }
    }

    // Determine best health status.
    // Since sorting already places reachable contexts first, the primary's
    // reachable flag is authoritative — don't aggregate across aliases which
    // may have a different auth context (#11149).
    const anyHealthy = group.some(c => c.healthy)

    deduplicatedClusters.push({
      ...primary,
      ...bestMetrics,
      healthy: anyHealthy || primary.healthy,
      reachable: primary.reachable,
      aliases,
    })
  }

  // Add clusters without server URL (can't be deduplicated)
  for (const cluster of (noServerClusters || [])) {
    deduplicatedClusters.push({ ...cluster, aliases: [] })
  }

  return deduplicatedClusters
}

// Helper to detect distribution from namespace list
export function detectDistributionFromNamespaces(namespaces: string[]): string | undefined {
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
export function detectDistributionFromServer(server?: string): string | undefined {
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
