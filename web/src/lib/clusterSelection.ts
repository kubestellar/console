export interface ClusterSelectionCandidate {
  name?: string | null
  isCurrent?: boolean | null
}

function normalizeClusterName(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getDefaultClusterSelection(clusters: readonly string[] | null | undefined): string
export function getDefaultClusterSelection(clusters: readonly ClusterSelectionCandidate[] | null | undefined): string
export function getDefaultClusterSelection(
  clusters: readonly (string | ClusterSelectionCandidate)[] | null | undefined,
): string {
  if (!clusters || clusters.length === 0) {
    return ''
  }

  const currentCluster = clusters.find((cluster): cluster is ClusterSelectionCandidate =>
    typeof cluster !== 'string' && cluster.isCurrent === true && normalizeClusterName(cluster.name) !== ''
  )

  if (currentCluster) {
    return normalizeClusterName(currentCluster.name)
  }

  if (clusters.length === 1) {
    const [singleCluster] = clusters
    return typeof singleCluster === 'string'
      ? normalizeClusterName(singleCluster)
      : normalizeClusterName(singleCluster.name)
  }

  return ''
}
