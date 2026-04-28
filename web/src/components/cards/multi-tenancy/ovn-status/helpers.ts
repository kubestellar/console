/**
 * Pure helper functions for the OVN Status card.
 *
 * All functions are stateless and unit-testable. They transform raw backend
 * pod and annotation data into the metrics shown by the card.
 */

import { isPodHealthy } from '../../../../lib/k8s'
export { parseReadyCount, isPodHealthy } from '../../../../lib/k8s'

// ============================================================================
// Types
// ============================================================================

export interface OvnPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  containers?: Array<{
    image?: string
    state?: 'running' | 'waiting' | 'terminated'
    reason?: string
  }>
}

/** Network type derived from UDN annotations */
export type UdnNetworkType = 'layer2' | 'layer3' | 'unknown'

/** Role of a UDN (primary vs secondary) */
export type UdnRole = 'primary' | 'secondary' | 'unknown'

export interface UdnInfo {
  /** Name from annotation value or pod name */
  name: string
  /** Layer 2 or Layer 3 */
  networkType: UdnNetworkType
  /** Primary or secondary network role */
  role: UdnRole
}

// ============================================================================
// Constants
// ============================================================================

/** Label value used by ovnkube-node DaemonSet pods */
export const OVN_NODE_LABEL = 'ovnkube-node'

/** Label value used by ovnkube-master pods */
export const OVN_MASTER_LABEL = 'ovnkube-master'

/** Label value used by ovnkube-controller pods */
export const OVN_CONTROLLER_LABEL = 'ovnkube-controller'

/** Pod annotation indicating a User Defined Network is attached */
export const UDN_ANNOTATION_KEY = 'k8s.ovn.org/user-defined-network'

/** Annotation key that may indicate the network topology (layer2 / layer3) */
export const UDN_TOPOLOGY_ANNOTATION_KEY = 'k8s.ovn.org/network-topology'

/** Annotation key that may indicate primary/secondary role */
export const UDN_ROLE_ANNOTATION_KEY = 'k8s.ovn.org/network-role'

// ============================================================================
// Functions
// ============================================================================

/**
 * Returns true if the pod is an OVN-Kubernetes infrastructure pod,
 * detected via the `app` label.
 */
export function isOvnPod(labels?: Record<string, string>): boolean {
  const appLabel = (labels ?? {}).app ?? ''
  return (
    appLabel === OVN_NODE_LABEL ||
    appLabel === OVN_MASTER_LABEL ||
    appLabel === OVN_CONTROLLER_LABEL
  )
}

/**
 * Extract User Defined Network (UDN) information from pods that carry the
 * `k8s.ovn.org/user-defined-network` annotation. De-duplicates by name.
 */
export function extractUdns(pods: OvnPodInfo[]): UdnInfo[] {
  const seen = new Set<string>()
  const udns: UdnInfo[] = []

  for (const pod of (pods || [])) {
    const annotations = pod.annotations ?? {}
    const udnValue = annotations[UDN_ANNOTATION_KEY]
    if (!udnValue) continue

    const name = udnValue || pod.name || 'unnamed'
    if (seen.has(name)) continue
    seen.add(name)

    const topologyRaw = (annotations[UDN_TOPOLOGY_ANNOTATION_KEY] ?? '').toLowerCase()
    let networkType: UdnNetworkType = 'unknown'
    if (topologyRaw.includes('layer2') || topologyRaw.includes('l2')) {
      networkType = 'layer2'
    } else if (topologyRaw.includes('layer3') || topologyRaw.includes('l3')) {
      networkType = 'layer3'
    }

    const roleRaw = (annotations[UDN_ROLE_ANNOTATION_KEY] ?? '').toLowerCase()
    let role: UdnRole = 'unknown'
    if (roleRaw.includes('primary')) {
      role = 'primary'
    } else if (roleRaw.includes('secondary')) {
      role = 'secondary'
    }

    udns.push({ name, networkType, role })
  }

  return udns
}

/**
 * Summarise OVN pod health from a list of OVN infrastructure pods.
 */
export function summarizeOvnPods(pods: OvnPodInfo[]): {
  total: number
  healthy: number
  unhealthy: number
} {
  let healthy = 0
  let unhealthy = 0

  for (const pod of (pods || [])) {
    if (isPodHealthy(pod)) {
      healthy += 1
    } else {
      unhealthy += 1
    }
  }

  return {
    total: healthy + unhealthy,
    healthy,
    unhealthy,
  }
}
