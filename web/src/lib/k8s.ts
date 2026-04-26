/**
 * Shared Kubernetes utility functions used across multiple card helpers.
 */

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
