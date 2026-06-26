/**
 * Standalone cluster-cache reference that breaks the circular dependency
 * between lib/cache and hooks/mcp/shared.
 *
 * hooks/mcp/shared.ts populates `_clusters` at init time; consumers
 * read via the exported getter without importing shared.ts.
 */

import type { ClusterInfo } from './types'

let _clusters: ClusterInfo[] = []

/**
 * Lightweight read-only reference to the current cluster list.
 * Used by lib/cache/fetcherUtils.ts to resolve clusters without
 * importing the full MCP shared module (which would create a cycle).
 */
export const clusterCacheRef = {
  get clusters(): ClusterInfo[] {
    return _clusters
  },
}

/** Called by hooks/mcp/shared.ts whenever the cluster cache changes. */
export function setClusterCacheRefClusters(clusters: ClusterInfo[]): void {
  _clusters = clusters
}
