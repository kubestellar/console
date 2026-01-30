import { useState } from 'react'

export interface DemoState {
  isLoading: boolean
  lastUpdated: Date | null
}

export function useDemoData<T>(data: T): DemoState & { data: T } {
  const [isLoading] = useState(false)
  const [lastUpdated] = useState<Date | null>(new Date())
  return { data, isLoading, lastUpdated }
}

// Clusters known to have llm-d stacks
export const LLMD_CLUSTERS = ['vllm-d', 'platform-eval']

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
