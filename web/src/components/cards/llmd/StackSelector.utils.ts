/**
 * Shared helpers for the llm-d StackSelector: status colors, sort types and
 * accelerator estimation.
 */
import type { LLMdStack } from '../../../hooks/useStackDiscovery'

export const STATUS_COLORS = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-gray-500 dark:bg-gray-400' }

export type SortField = 'name' | 'accelerators' | 'status' | 'replicas'
export type SortDirection = 'asc' | 'desc'

type AcceleratorType = 'GPU' | 'TPU' | 'AIU' | 'XPU'

interface AcceleratorInfo {
  count: number
  type: string
  category: AcceleratorType
}

// Estimate accelerator count and type from replicas and cluster/model info
// Uses 1 accelerator per replica as conservative estimate
export function estimateAccelerators(stack: LLMdStack): AcceleratorInfo {
  const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
  const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
  const unifiedCount = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)
  const total = prefillCount + decodeCount + unifiedCount

  // Infer accelerator type from cluster name, namespace, or model
  const cluster = stack.cluster.toLowerCase()
  const namespace = stack.namespace.toLowerCase()
  const model = stack.model?.toLowerCase() || ''

  // Check for TPU clusters (Google Cloud)
  if (cluster.includes('tpu') || namespace.includes('tpu')) {
    return { count: total, type: 'Google TPU v5p', category: 'TPU' }
  }

  // Check for AIU clusters (IBM)
  if (cluster.includes('aiu') || namespace.includes('aiu') || cluster.includes('ibm')) {
    return { count: total, type: 'IBM AIU', category: 'AIU' }
  }

  // Check for Intel XPU
  if (cluster.includes('intel') || cluster.includes('xpu')) {
    return { count: total, type: 'Intel Gaudi2', category: 'XPU' }
  }

  // Default: NVIDIA GPU - infer specific type from model size
  let gpuType = 'NVIDIA H100'
  if (model.includes('70b') || model.includes('65b')) {
    gpuType = 'NVIDIA H100 80GB'
  } else if (model.includes('13b') || model.includes('7b')) {
    gpuType = 'NVIDIA A100 40GB'
  } else if (model.includes('granite')) {
    gpuType = 'NVIDIA A100 80GB'
  }

  return { count: total, type: gpuType, category: 'GPU' }
}

export function getStatusPriority(status: LLMdStack['status']): number {
  switch (status) {
    case 'healthy': return 0
    case 'degraded': return 1
    case 'unhealthy': return 2
    default: return 3
  }
}
