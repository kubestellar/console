/**
 * Pure helper functions for the K3s Status card.
 *
 * All functions are stateless and unit-testable. They transform raw backend
 * pod and node data into the metrics shown by the card.
 */

// ============================================================================
// Types
// ============================================================================

export interface K3sPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
  containers?: Array<{
    image?: string
    state?: 'running' | 'waiting' | 'terminated'
    reason?: string
  }>
}

export interface K3sNodeInfo {
  name?: string
  containerRuntime?: string
  conditions?: Array<{ type?: string; status?: string }>
}

// ============================================================================
// Constants
// ============================================================================

/** Label value used by K3s server/agent pods */
export const K3S_APP_LABEL = 'k3s'

/** Substring to match in container images indicating a K3s binary */
export const K3S_IMAGE_SUBSTRING = 'rancher/k3s'

/** Substring in node containerRuntime that indicates K3s */
export const K3S_RUNTIME_SUBSTRING = 'k3s'

// ============================================================================
// Functions
// ============================================================================

/**
 * Returns true if the pod is a K3s server/agent pod, detected via
 * the `app` label.
 */
export function isK3sPodByLabel(labels?: Record<string, string>): boolean {
  const appLabel = (labels ?? {}).app ?? ''
  return appLabel === K3S_APP_LABEL
}

/**
 * Returns true if any container image in the pod contains the K3s image substring.
 */
export function isK3sPodByImage(containers?: Array<{ image?: string }>): boolean {
  return (containers || []).some((c) => {
    const image = (c.image ?? '').toLowerCase()
    return image.includes(K3S_IMAGE_SUBSTRING)
  })
}

/**
 * Returns true if the node's containerRuntime indicates K3s.
 */
export function isK3sNode(containerRuntime?: string): boolean {
  return (containerRuntime ?? '').toLowerCase().includes(K3S_RUNTIME_SUBSTRING)
}

export { parseReadyCount, isPodHealthy } from '../../../../lib/k8s'

/**
 * Returns true if a pod qualifies as a K3s pod (by label OR by image).
 */
export function isK3sPod(pod: K3sPodInfo): boolean {
  return isK3sPodByLabel(pod.labels) || isK3sPodByImage(pod.containers)
}

/**
 * Classify K3s pods into server pods (likely control-plane) vs agent connections.
 * Server pods are identified by name containing "server" or the pod running
 * in a namespace with "server" in its name. Everything else is an agent.
 */
export function classifyK3sPods(pods: K3sPodInfo[]): {
  serverPods: K3sPodInfo[]
  agentPods: K3sPodInfo[]
} {
  const serverPods: K3sPodInfo[] = []
  const agentPods: K3sPodInfo[] = []

  for (const pod of (pods || [])) {
    const name = (pod.name ?? '').toLowerCase()
    const ns = (pod.namespace ?? '').toLowerCase()
    if (name.includes('server') || ns.includes('server')) {
      serverPods.push(pod)
    } else {
      agentPods.push(pod)
    }
  }

  return { serverPods, agentPods }
}

/**
 * Count K3s nodes from the node list.
 */
export function countK3sNodes(nodes: K3sNodeInfo[]): number {
  return (nodes || []).filter((node) => isK3sNode(node.containerRuntime)).length
}
