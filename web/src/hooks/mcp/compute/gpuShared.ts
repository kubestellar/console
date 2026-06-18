import { isDemoMode } from '../../../lib/demoMode'
import type { GPUNode } from '../types'

export const GPU_CACHE_KEY = 'kubestellar-gpu-cache'

export interface GPUNodeCache {
  nodes: GPUNode[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  lastRefresh: Date | null
}

export function loadGPUCacheFromStorage(): GPUNodeCache {
  try {
    const stored = localStorage.getItem(GPU_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return {
          nodes: parsed.nodes,
          lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
          isLoading: false,
          isRefreshing: false,
          error: null,
          consecutiveFailures: 0,
          lastRefresh: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return { nodes: [], lastUpdated: null, isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null }
}

export function saveGPUCacheToStorage(cache: GPUNodeCache) {
  try {
    if (cache.nodes.length > 0 && !isDemoMode()) {
      localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
        nodes: cache.nodes,
        lastUpdated: cache.lastUpdated?.toISOString(),
      }))
    }
  } catch {
    // Ignore storage errors
  }
}

export function getDemoGPUNodes(): GPUNode[] {
  return [
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8, acceleratorType: 'GPU' },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7, acceleratorType: 'GPU' },
    { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2, acceleratorType: 'GPU' },
    { name: 'gke-tpu-node-1', cluster: 'gke-staging', gpuType: 'Google TPU v4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'gke-tpu-node-2', cluster: 'gke-staging', gpuType: 'Google TPU v5e', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' },
    { name: 'gaudi-node-1', cluster: 'openshift-prod', gpuType: 'Intel Gaudi2', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU', manufacturer: 'Intel' },
    { name: 'oci-aiu-node-1', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'oci-aiu-node-2', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'aks-xpu-node-1', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Max', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'aks-xpu-node-2', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Flex', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
  ]
}

export const __computeTestables = { loadGPUCacheFromStorage, GPU_CACHE_KEY }
