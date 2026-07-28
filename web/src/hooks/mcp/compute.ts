/**
 * Compute hooks barrel — re-exports from focused sub-modules.
 *
 * Split from the original compute.ts — see issue #15790 / #21606:
 *   compute/gpuNodes.ts  — GPU node cache, fetch, useGPUNodes
 *   compute/nodes.ts     — useNodes, NodeClusterError
 *   compute/nvidia.ts    — useNVIDIAOperators
 *
 * All existing imports from '@/hooks/mcp/compute' continue to work.
 */
export {
  gpuNodeCache,
  gpuNodeSubscribers,
  notifyGPUNodeSubscribers,
  updateGPUNodeCache,
  useGPUNodes,
  __computeTestables,
} from './compute/gpuNodes'
export type { NodeClusterError } from './compute/nodes'
export { useNodes } from './compute/nodes'
export { useNVIDIAOperators } from './compute/nvidia'
