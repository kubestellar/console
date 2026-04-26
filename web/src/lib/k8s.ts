/**
 * Shared Kubernetes utility functions used across multiple card helpers.
 */

/** Minimal pod shape accepted by {@link isPodHealthy}. */
export interface PodHealthInfo {
  status?: string
  ready?: string
}

/**
 * Parse a Kubernetes "ready/total" string (e.g. "2/3") into numeric parts.
 * Returns `{ ready: 0, total: 0 }` for missing or malformed input.
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
 * Accepts any object with optional `status` and `ready` fields.
 */
export function isPodHealthy(pod: { status?: string; ready?: string }): boolean {
  const status = (pod.status ?? '').toLowerCase()
  if (status !== 'running') return false

  const { ready, total } = parseReadyCount(pod.ready)
  return total > 0 && ready === total
}
