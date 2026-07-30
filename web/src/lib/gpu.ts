/**
 * Shared GPU card utilities.
 *
 * Functions used by GPUWorkloads, GPUUsageTrend, and GPUNamespaceAllocations
 * to normalise cluster identifiers and detect GPU resource requests.
 */

const MAX_TAG_DISPLAY_LENGTH = 20
const TAG_TRUNCATE_LENGTH = 12

export function normalizeClusterName(cluster: string): string {
  if (!cluster) return ''
  const parts = cluster.split('/')
  return parts[parts.length - 1] || cluster
}

export function hasGPUResourceRequest(containers?: { gpuRequested?: number }[]): boolean {
  if (!containers) return false
  return containers.some(c => (c.gpuRequested ?? 0) > 0)
}

/**
 * Extract the image tag (version) from a container image reference.
 *
 * @example
 * extractImageTag('nginx:1.25')           // '1.25'
 * extractImageTag('registry.io/app:sha256:abc...def')  // 'abc...def' (truncated)
 * extractImageTag('nginx')                // 'latest'
 * extractImageTag(undefined)              // 'unknown'
 */
export function extractImageTag(image?: string): string {
  if (!image) return 'unknown'
  const parts = image.split(':')
  if (parts.length > 1) {
    const tag = parts[parts.length - 1]
    if (tag.length > MAX_TAG_DISPLAY_LENGTH) return tag.substring(0, TAG_TRUNCATE_LENGTH)
    return tag
  }
  return 'latest'
}
