/**
 * Utility functions for handling cluster name formatting and parsing
 */

/**
 * Extract the display name from a cluster identifier
 * Cluster names typically use the format "context/name", this extracts just the name portion
 * @param cluster - The full cluster identifier (e.g., "default/my-cluster")
 * @returns The display name (e.g., "my-cluster") or the original cluster if no '/' separator
 */
export function getClusterDisplayName(cluster: string | undefined): string {
  if (!cluster) return ''
  return cluster.split('/').pop() || cluster
}
