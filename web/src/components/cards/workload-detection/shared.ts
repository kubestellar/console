import { useState, useMemo } from 'react'
import type { ClusterInfo } from '../../../hooks/mcp/types'

export interface DemoState {
  isLoading: boolean
  lastUpdated: Date | null
}

export function useDemoData<T>(data: T): DemoState & { data: T } {
  const [isLoading] = useState(false)
  const [lastUpdated] = useState<Date | null>(new Date())
  return { data, isLoading, lastUpdated }
}

// Keywords that indicate a cluster may have LLM-d or AI/ML workloads
const LLMD_CLUSTER_KEYWORDS = [
  'vllm', 'llm', 'inference', 'model', 'eval', 'gpu', 'ai', 'ml',
  'tgi', 'triton', 'serving', 'aibrix', 'hc4ai', 'pok', 'prod',
]

// Default clusters known to have llm-d stacks (fallback)
// These are used when cluster discovery hasn't completed yet
export const LLMD_CLUSTERS = [
  'vllm-d',
  'pok-prod-001',
  'platform-eval',
]

/**
 * Dynamically discover clusters that likely have LLM-d stacks
 * based on cluster name patterns and GPU availability
 */
export function useLLMdClusters(
  clusters: ClusterInfo[],
  gpuClusterNames: Set<string> = new Set()
): string[] {
  return useMemo(() => {
    // If clusters not loaded yet, use known fallback clusters
    if (clusters.length === 0) {
      console.log('[useLLMdClusters] No clusters loaded, using fallback:', LLMD_CLUSTERS)
      return LLMD_CLUSTERS
    }

    const reachable = clusters.filter(c => c.reachable !== false)

    // If no reachable clusters, use fallback
    if (reachable.length === 0) {
      return LLMD_CLUSTERS
    }

    // Find clusters that likely have LLM workloads based on:
    // 1. Clusters with GPU nodes
    // 2. Cluster names containing AI/ML keywords
    const candidates = reachable.filter(c => {
      const nameLower = c.name.toLowerCase()
      return gpuClusterNames.has(c.name) ||
        LLMD_CLUSTER_KEYWORDS.some(kw => nameLower.includes(kw))
    }).map(c => c.name)

    // If no candidates found via keywords, use known fallback clusters that exist
    if (candidates.length === 0) {
      const reachableNames = new Set(reachable.map(c => c.name))
      const fallbackMatches = LLMD_CLUSTERS.filter(name => reachableNames.has(name))
      if (fallbackMatches.length > 0) {
        console.log('[useLLMdClusters] No keyword matches, using fallback:', fallbackMatches)
        return fallbackMatches
      }
      // Last resort: return first 10 reachable clusters
      const lastResort = reachable.slice(0, 10).map(c => c.name)
      console.log('[useLLMdClusters] Last resort - first 10 reachable:', lastResort)
      return lastResort
    }

    console.log('[useLLMdClusters] Found candidates:', candidates)
    return candidates
  }, [clusters, gpuClusterNames])
}

export const DEMO_ML_JOBS = [
  { name: 'train-gpt-finetune', framework: 'PyTorch', status: 'running', gpus: 8, progress: 67, eta: '2h 15m', cluster: 'gpu-cluster-1' },
  { name: 'eval-llama-benchmark', framework: 'Ray', status: 'running', gpus: 4, progress: 89, eta: '25m', cluster: 'gpu-cluster-1' },
  { name: 'pretrain-vision-model', framework: 'JAX', status: 'queued', gpus: 16, progress: 0, eta: '-', cluster: 'us-east-1' },
  { name: 'rlhf-reward-model', framework: 'DeepSpeed', status: 'running', gpus: 8, progress: 34, eta: '5h 45m', cluster: 'us-west-2' },
  { name: 'inference-optimization', framework: 'TensorRT', status: 'completed', gpus: 2, progress: 100, eta: '-', cluster: 'eu-central-1' },
]

export const DEMO_NOTEBOOKS = [
  { name: 'research-experiments', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '2m ago' },
  { name: 'model-analysis', user: 'bob', status: 'running', cpu: '8 cores', memory: '32GB', gpu: '1x A10G', lastActive: '15m ago' },
  { name: 'data-preprocessing', user: 'charlie', status: 'idle', cpu: '2 cores', memory: '8GB', gpu: '-', lastActive: '2h ago' },
  { name: 'benchmark-suite', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '5m ago' },
]
