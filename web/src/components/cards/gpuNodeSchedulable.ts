// Pure schedulability helpers for GPU nodes (issue #23676).
// Kept out of GPUTaintFilter.tsx so that component file only exports
// components (react-refresh/only-export-components).
import type { GPUNode } from '../../hooks/mcp/types'
import { nodeToleratesAll } from './GPUTaintFilter'

/** Empty toleration set: every NoSchedule/NoExecute taint gates scheduling. */
const NO_TOLERATIONS: ReadonlySet<string> = new Set<string>()

/**
 * Returns `true` iff new pods can actually be scheduled onto the node:
 * it is not cordoned (`unschedulable !== true`), it is not NotReady
 * (`ready !== false`; `undefined` is treated as ready for older agents that
 * do not report it), and every NoSchedule/NoExecute taint is tolerated.
 * Used to keep GPUs on such nodes out of "Available" counts (issue #23676).
 */
export function isGPUNodeSchedulable(
  node: GPUNode,
  tolerated: ReadonlySet<string> = NO_TOLERATIONS,
): boolean {
  if (!node) return false
  if (node.unschedulable === true) return false
  if (node.ready === false) return false
  return nodeToleratesAll(node, tolerated as Set<string>)
}

/**
 * Number of GPUs on `node` that are free (not allocated) but cannot be
 * scheduled because the node is cordoned, NotReady or untolerated-tainted.
 * Zero for schedulable nodes. Allocated GPUs are never counted here: pods
 * already running on a cordoned node keep their GPUs.
 */
export function unschedulableFreeGPUs(
  node: GPUNode,
  tolerated: ReadonlySet<string> = NO_TOLERATIONS,
): number {
  if (isGPUNodeSchedulable(node, tolerated)) return 0
  return Math.max((node.gpuCount || 0) - Math.max(node.gpuAllocated || 0, 0), 0)
}
