/**
 * Pure helper functions for the KubeFlex Status card.
 *
 * All functions are stateless and unit-testable. They transform raw backend
 * pod data into the metrics shown by the card.
 */

// ============================================================================
// Types
// ============================================================================

export interface KubeFlexPodInfo {
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

/** Summary of a KubeFlex-managed control plane */
export interface ControlPlaneInfo {
  /** Control plane name (derived from pod labels or name) */
  name: string
  /** Whether the control plane's pods are all healthy */
  healthy: boolean
}

// ============================================================================
// Constants
// ============================================================================

/** Label key/value used by the KubeFlex Helm chart */
export const KUBEFLEX_NAME_LABEL_KEY = 'app.kubernetes.io/name'

/** Label value for the KubeFlex controller manager */
export const KUBEFLEX_NAME_LABEL_VALUE = 'kubeflex'

/** Alternative label key used by KubeFlex controller pods */
export const KUBEFLEX_APP_LABEL_KEY = 'app'

/** Alternative label value for the KubeFlex controller */
export const KUBEFLEX_CONTROLLER_LABEL_VALUE = 'kubeflex-controller'

/** Label key indicating a KubeFlex-managed control plane pod */
export const KUBEFLEX_CP_LABEL_KEY = 'kubeflex.io/control-plane'

// ============================================================================
// Functions
// ============================================================================

/**
 * Returns true if the pod is a KubeFlex infrastructure (controller) pod.
 */
export function isKubeFlexControllerPod(labels?: Record<string, string>): boolean {
  const l = labels ?? {}
  if (l[KUBEFLEX_NAME_LABEL_KEY] === KUBEFLEX_NAME_LABEL_VALUE) return true
  if (l[KUBEFLEX_APP_LABEL_KEY] === KUBEFLEX_CONTROLLER_LABEL_VALUE) return true
  return false
}

/**
 * Returns true if the pod belongs to a KubeFlex-managed control plane.
 */
export function isKubeFlexControlPlanePod(labels?: Record<string, string>): boolean {
  const l = labels ?? {}
  return Boolean(l[KUBEFLEX_CP_LABEL_KEY])
}

import { isPodHealthy } from '../../../../lib/k8s'
export { parseReadyCount, isPodHealthy } from '../../../../lib/k8s'

/**
 * Group control-plane pods by control plane name and determine health per CP.
 * Returns a de-duplicated list of control planes with their health status.
 */
export function groupControlPlanes(pods: KubeFlexPodInfo[]): ControlPlaneInfo[] {
  const cpMap = new Map<string, { healthy: boolean }>()

  for (const pod of (pods || [])) {
    const cpName = (pod.labels ?? {})[KUBEFLEX_CP_LABEL_KEY]
    if (!cpName) continue

    const existing = cpMap.get(cpName)
    const podHealthy = isPodHealthy(pod)

    if (!existing) {
      cpMap.set(cpName, { healthy: podHealthy })
    } else if (!podHealthy) {
      // One unhealthy pod degrades the whole control plane
      existing.healthy = false
    }
  }

  return Array.from(cpMap.entries()).map(([name, info]) => ({
    name,
    healthy: info.healthy,
  }))
}

/**
 * Count unique tenant namespaces across control-plane pods.
 * A "tenant" is identified by the pod's namespace.
 */
export function countTenants(cpPods: KubeFlexPodInfo[]): number {
  const namespaces = new Set<string>()
  for (const pod of (cpPods || [])) {
    const ns = pod.namespace
    if (ns) {
      namespaces.add(ns)
    }
  }
  return namespaces.size
}
