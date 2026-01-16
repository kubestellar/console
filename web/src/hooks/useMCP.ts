import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

// Types matching the backend MCP bridge
export interface ClusterInfo {
  name: string
  context: string
  server?: string
  healthy: boolean
  source?: string
  nodeCount?: number
  podCount?: number
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  apiServer?: string
  nodeCount: number
  readyNodes: number
  podCount?: number
  issues?: string[]
}

export interface PodInfo {
  name: string
  namespace: string
  cluster?: string
  status: string
  ready: string
  restarts: number
  age: string
  node?: string
}

export interface PodIssue {
  name: string
  namespace: string
  cluster?: string
  status: string
  reason?: string
  issues: string[]
  restarts: number
}

export interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster?: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export interface DeploymentIssue {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  reason?: string
  message?: string
}

export interface GPUNode {
  name: string
  cluster: string
  gpuType: string
  gpuCount: number
  gpuAllocated: number
}

export interface MCPStatus {
  opsClient: {
    available: boolean
    toolCount: number
  }
  deployClient: {
    available: boolean
    toolCount: number
  }
}

// Hook to get MCP status
export function useMCPStatus() {
  const [status, setStatus] = useState<MCPStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get<MCPStatus>('/api/mcp/status')
        setStatus(data)
        setError(null)
      } catch (err) {
        setError('MCP bridge not available')
        setStatus(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return { status, isLoading, error }
}

// Hook to list clusters
export function useClusters() {
  const [clusters, setClusters] = useState<ClusterInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
      setClusters(data.clusters || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch clusters')
      // Return demo data if MCP not available
      setClusters(getDemoClusters())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { clusters, isLoading, error, refetch }
}

// Hook to get cluster health
export function useClusterHealth(cluster?: string) {
  const [health, setHealth] = useState<ClusterHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const url = cluster ? `/api/mcp/clusters/${cluster}/health` : '/api/mcp/clusters/health'
      const { data } = await api.get<ClusterHealth>(url)
      setHealth(data)
      setError(null)
    } catch (err) {
      setError('Failed to fetch cluster health')
      setHealth(getDemoHealth(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { health, isLoading, error, refetch }
}

// Hook to get pod issues
export function usePodIssues(cluster?: string, namespace?: string) {
  const [issues, setIssues] = useState<PodIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: PodIssue[] }>(`/api/mcp/pod-issues?${params}`)
      setIssues(data.issues || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch pod issues')
      setIssues(getDemoPodIssues())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { issues, isLoading, error, refetch }
}

// Hook to get events
export function useEvents(cluster?: string, namespace?: string, limit = 20) {
  const [events, setEvents] = useState<ClusterEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const { data } = await api.get<{ events: ClusterEvent[] }>(`/api/mcp/events?${params}`)
      setEvents(data.events || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch events')
      setEvents(getDemoEvents())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, limit])

  useEffect(() => {
    refetch()
    // Poll every 10 seconds for events
    const interval = setInterval(refetch, 10000)
    return () => clearInterval(interval)
  }, [refetch])

  return { events, isLoading, error, refetch }
}

// Hook to get deployment issues
export function useDeploymentIssues(cluster?: string, namespace?: string) {
  const [issues, setIssues] = useState<DeploymentIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: DeploymentIssue[] }>(`/api/mcp/deployment-issues?${params}`)
      setIssues(data.issues || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch deployment issues')
      setIssues(getDemoDeploymentIssues())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { issues, isLoading, error, refetch }
}

// Hook to get warning events
export function useWarningEvents(cluster?: string, namespace?: string, limit = 20) {
  const [events, setEvents] = useState<ClusterEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const { data } = await api.get<{ events: ClusterEvent[] }>(`/api/mcp/events/warnings?${params}`)
      setEvents(data.events || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch warning events')
      setEvents(getDemoEvents().filter(e => e.type === 'Warning'))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, limit])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, 10000)
    return () => clearInterval(interval)
  }, [refetch])

  return { events, isLoading, error, refetch }
}

// Hook to get GPU nodes
export function useGPUNodes(cluster?: string) {
  const [nodes, setNodes] = useState<GPUNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ nodes: GPUNode[] }>(`/api/mcp/gpu-nodes?${params}`)
      setNodes(data.nodes || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch GPU nodes')
      // Return demo GPU data
      setNodes(getDemoGPUNodes())
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { nodes, isLoading, error, refetch }
}

// Demo data fallbacks
function getDemoClusters(): ClusterInfo[] {
  return [
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15 },
    { name: 'vllm-d', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124 },
    { name: 'prod-east', context: 'prod-east', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 89 },
    { name: 'staging', context: 'staging', healthy: false, source: 'kubeconfig', nodeCount: 3, podCount: 42 },
  ]
}

function getDemoHealth(cluster?: string): ClusterHealth {
  return {
    cluster: cluster || 'default',
    healthy: true,
    nodeCount: 3,
    readyNodes: 3,
    podCount: 45,
    issues: [],
  }
}

function getDemoPodIssues(): PodIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'CrashLoopBackOff',
      reason: 'Error',
      issues: ['Container restarting', 'OOMKilled'],
      restarts: 15,
    },
    {
      name: 'worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'ImagePullBackOff',
      reason: 'ImagePullBackOff',
      issues: ['Failed to pull image'],
      restarts: 0,
    },
    {
      name: 'cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      status: 'Pending',
      reason: 'Unschedulable',
      issues: ['Insufficient memory'],
      restarts: 0,
    },
  ]
}

function getDemoDeploymentIssues(): DeploymentIssue[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      replicas: 3,
      readyReplicas: 1,
      reason: 'Unavailable',
      message: 'Deployment does not have minimum availability',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      replicas: 5,
      readyReplicas: 3,
      reason: 'Progressing',
      message: 'ReplicaSet is progressing',
    },
  ]
}

function getDemoGPUNodes(): GPUNode[] {
  return [
    { name: 'gpu-node-1', cluster: 'vllm-d', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6 },
    { name: 'gpu-node-2', cluster: 'vllm-d', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
    { name: 'gpu-node-3', cluster: 'vllm-d', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 },
    { name: 'gpu-worker-1', cluster: 'ops', gpuType: 'NVIDIA V100', gpuCount: 4, gpuAllocated: 2 },
    { name: 'ml-node-1', cluster: 'prod-east', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2 },
  ]
}

function getDemoEvents(): ClusterEvent[] {
  return [
    {
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available to schedule pod',
      object: 'Pod/worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      count: 3,
    },
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod to node-2',
      object: 'Pod/api-server-7d8f9c6b5-abc12',
      namespace: 'production',
      cluster: 'prod-east',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      object: 'Pod/api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      count: 15,
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image pulled successfully',
      object: 'Pod/frontend-8e9f0a1b2-def34',
      namespace: 'web',
      cluster: 'staging',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: connection refused',
      object: 'Pod/cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      count: 8,
    },
  ]
}
