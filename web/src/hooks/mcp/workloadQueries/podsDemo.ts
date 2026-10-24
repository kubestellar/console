import type { PodInfo, PodIssue } from '../types'

// ---------------------------------------------------------------------------
// Demo data (internal to this module)
// ---------------------------------------------------------------------------

export function getDemoPods(): PodInfo[] {
  return [
    { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 15, age: '2d', node: 'node-1' },
    { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 8, age: '5h', node: 'gpu-node-2' },
    { name: 'cache-redis-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 5, age: '14d', node: 'node-3' },
    { name: 'frontend-8e9f0a1b2-def34', namespace: 'web', cluster: 'prod-west', status: 'Running', ready: '1/1', restarts: 3, age: '1d', node: 'node-2' },
    { name: 'nginx-ingress-abc123', namespace: 'ingress', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 2, age: '7d', node: 'node-1' },
    { name: 'monitoring-agent-xyz', namespace: 'monitoring', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 1, age: '30d', node: 'node-4' },
    { name: 'api-gateway-pod-1', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '3d', node: 'node-2' },
    { name: 'worker-processor-1', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '12h', node: 'gpu-node-1' },
    { name: 'database-primary-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 0, age: '60d', node: 'node-5' },
    { name: 'scheduler-job-xyz', namespace: 'system', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '4h', node: 'node-1' },
  ]
}

export function getDemoPodIssues(): PodIssue[] {
  return [
    {
      name: 'api-server-crash-7d8f9c6b5',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'CrashLoopBackOff',
      restarts: 23,
      reason: 'CrashLoopBackOff',
      issues: ['Back-off 5m0s restarting failed container'],
    },
    {
      name: 'worker-oom-5c6d7e8f9',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'OOMKilled',
      restarts: 8,
      reason: 'OOMKilled',
      issues: ['Container exceeded memory limit'],
    },
    {
      name: 'pending-pod-abc123',
      namespace: 'staging',
      cluster: 'staging',
      status: 'Pending',
      restarts: 0,
      reason: 'Unschedulable',
      issues: ['No nodes available with required resources'],
    },
  ]
}

export function getDemoAllPods(): PodInfo[] {
  // Returns pods across all clusters for useAllPods
  return [
    ...getDemoPods(),
    { name: 'ml-inference-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'ml-inference-1', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'model-server-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '2/2', restarts: 1, age: '10d', node: 'gpu-node-1' },
    { name: 'training-job-abc', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'gpu-node-1' },
  ]
}
