/**
 * Pure helper functions for the KubeVirt Status card.
 *
 * All functions are stateless and unit-testable. They transform raw backend
 * pod data into the metrics shown by the card.
 */

// ============================================================================
// Types
// ============================================================================

export interface KubevirtPodInfo {
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

/** Possible VM states derived from virt-launcher pod status */
export type VmState = 'running' | 'stopped' | 'paused' | 'migrating' | 'pending' | 'failed' | 'unknown'

// ============================================================================
// Constants
// ============================================================================

/** Namespace where KubeVirt is typically installed */
export const KUBEVIRT_NAMESPACE = 'kubevirt'

/** Known KubeVirt infrastructure component app labels */
export const KUBEVIRT_INFRA_APP_LABELS = new Set([
  'virt-operator',
  'virt-controller',
  'virt-api',
  'virt-handler',
])

/** Label value on VM launcher pods (each represents a running VM) */
export const VIRT_LAUNCHER_LABEL = 'virt-launcher'

// ============================================================================
// Functions
// ============================================================================

/**
 * Returns true if the pod is a KubeVirt infrastructure pod (operator,
 * controller, api, handler). These pods are in the kubevirt namespace
 * and have a matching `app` label.
 */
export function isKubevirtPod(labels?: Record<string, string>, namespace?: string): boolean {
  if (namespace !== KUBEVIRT_NAMESPACE) return false
  const appLabel = (labels ?? {}).app ?? ''
  return KUBEVIRT_INFRA_APP_LABELS.has(appLabel)
}

/**
 * Returns true if the pod is a virt-launcher — each represents one VM.
 */
export function isVirtLauncher(labels?: Record<string, string>): boolean {
  const appLabel = (labels ?? {}).app ?? ''
  return appLabel === VIRT_LAUNCHER_LABEL
}

/**
 * Parse a Kubernetes "ready" string like "1/1" into numeric values.
 */
export function parseReadyCount(ready?: string): { ready: number; total: number } {
  const [readyPart, totalPart] = String(ready ?? '').split('/')
  const readyCount = Number.parseInt(readyPart, 10)
  const totalCount = Number.parseInt(totalPart, 10)
  return {
    ready: Number.isFinite(readyCount) ? readyCount : 0,
    total: Number.isFinite(totalCount) ? totalCount : 0,
  }
}

/**
 * Determine whether a pod is healthy based on its status and ready ratio.
 */
export function isPodHealthy(pod: KubevirtPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  if (status !== 'running') return false

  const { ready, total } = parseReadyCount(pod.ready)
  return total > 0 && ready === total
}

/**
 * Extract VM state from a virt-launcher pod's status.
 *
 * - Running + ready => 'running'
 * - Status contains 'migrat' => 'migrating'
 * - Paused => 'paused' (VM suspended / hibernated)
 * - Pending => 'pending'
 * - Succeeded/Completed => 'stopped' (VM powered off gracefully)
 * - Failed/CrashLoopBackOff => 'failed'
 * - Otherwise => 'unknown'
 */
export function getVmStatus(pod: KubevirtPodInfo): VmState {
  const status = (pod.status ?? '').toLowerCase()

  // Check for migration-related status first
  if (status.includes('migrat')) return 'migrating'

  // Check for paused/suspended VMs
  if (status === 'paused' || status === 'suspended') return 'paused'

  if (status === 'running') {
    const { ready, total } = parseReadyCount(pod.ready)
    if (total > 0 && ready === total) return 'running'
    return 'pending'
  }

  if (status === 'pending') return 'pending'
  if (status === 'succeeded' || status === 'completed') return 'stopped'
  if (status === 'failed' || status === 'crashloopbackoff') return 'failed'

  return 'unknown'
}

/**
 * Summarise KubeVirt infrastructure pods by health.
 */
export function summarizeKubevirtPods(pods: KubevirtPodInfo[]): {
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

/**
 * Count VMs by state from virt-launcher pods.
 */
export function countVmsByState(vmPods: KubevirtPodInfo[]): Record<VmState, number> {
  const counts: Record<VmState, number> = {
    running: 0,
    stopped: 0,
    paused: 0,
    migrating: 0,
    pending: 0,
    failed: 0,
    unknown: 0,
  }

  for (const pod of (vmPods || [])) {
    const state = getVmStatus(pod)
    counts[state] += 1
  }

  return counts
}

/**
 * Count unique tenant namespaces across VM launcher pods.
 */
export function countVmTenants(vmPods: KubevirtPodInfo[]): number {
  const namespaces = new Set<string>()
  for (const pod of (vmPods || [])) {
    const ns = pod.namespace
    if (ns && ns !== KUBEVIRT_NAMESPACE) {
      namespaces.add(ns)
    }
  }
  return namespaces.size
}
