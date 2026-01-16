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

export interface Deployment {
  name: string
  namespace: string
  cluster?: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progress: number
  image?: string
  age?: string
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

// Hook to get pods
export function usePods(cluster?: string, namespace?: string, sortBy: 'restarts' | 'name' = 'restarts', limit = 10) {
  const [pods, setPods] = useState<PodInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?${params}`)
      let sortedPods = data.pods || []

      // Sort by restarts (descending) or name
      if (sortBy === 'restarts') {
        sortedPods = sortedPods.sort((a, b) => b.restarts - a.restarts)
      } else {
        sortedPods = sortedPods.sort((a, b) => a.name.localeCompare(b.name))
      }

      // Limit results
      setPods(sortedPods.slice(0, limit))
      setError(null)
    } catch (err) {
      setError('Failed to fetch pods')
      setPods(getDemoPods())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, sortBy, limit])

  useEffect(() => {
    refetch()
    // Poll every 15 seconds for pod updates
    const interval = setInterval(refetch, 15000)
    return () => clearInterval(interval)
  }, [refetch])

  return { pods, isLoading, error, refetch }
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

// Hook to get deployments with rollout status
export function useDeployments(cluster?: string, namespace?: string) {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ deployments: Deployment[] }>(`/api/mcp/deployments?${params}`)
      setDeployments(data.deployments || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch deployments')
      setDeployments(getDemoDeployments())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    // Poll every 10 seconds for deployment updates
    const interval = setInterval(refetch, 10000)
    return () => clearInterval(interval)
  }, [refetch])

  return { deployments, isLoading, error, refetch }
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

// Security issue types
export interface SecurityIssue {
  name: string
  namespace: string
  cluster?: string
  issue: string
  severity: 'high' | 'medium' | 'low'
  details?: string
}

// Hook to get security issues
export function useSecurityIssues(cluster?: string, namespace?: string) {
  const [issues, setIssues] = useState<SecurityIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: SecurityIssue[] }>(`/api/mcp/security-issues?${params}`)
      setIssues(data.issues || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch security issues')
      // Return demo security issues
      setIssues(getDemoSecurityIssues())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { issues, isLoading, error, refetch }
}

// GitOps drift types
export interface GitOpsDrift {
  resource: string
  namespace: string
  cluster: string
  kind: string
  driftType: 'modified' | 'deleted' | 'added'
  gitVersion: string
  details?: string
  severity: 'high' | 'medium' | 'low'
}

// Hook to get GitOps drifts
export function useGitOpsDrifts(cluster?: string, namespace?: string) {
  const [drifts, setDrifts] = useState<GitOpsDrift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ drifts: GitOpsDrift[] }>(`/api/gitops/drifts?${params}`)
      setDrifts(data.drifts || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch GitOps drifts')
      setDrifts(getDemoGitOpsDrifts())
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    // Poll every 30 seconds
    const interval = setInterval(refetch, 30000)
    return () => clearInterval(interval)
  }, [refetch])

  return { drifts, isLoading, error, refetch }
}

function getDemoGitOpsDrifts(): GitOpsDrift[] {
  return [
    {
      resource: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Deployment',
      driftType: 'modified',
      gitVersion: 'v2.4.0',
      details: 'Image tag changed from v2.4.0 to v2.4.1-hotfix',
      severity: 'medium',
    },
    {
      resource: 'config-secret',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Secret',
      driftType: 'modified',
      gitVersion: 'abc123',
      details: 'Secret data modified manually',
      severity: 'high',
    },
    {
      resource: 'debug-pod',
      namespace: 'default',
      cluster: 'staging',
      kind: 'Pod',
      driftType: 'added',
      gitVersion: '-',
      details: 'Resource exists in cluster but not in Git',
      severity: 'low',
    },
  ]
}

function getDemoSecurityIssues(): SecurityIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      issue: 'Privileged container',
      severity: 'high',
      details: 'Container running in privileged mode',
    },
    {
      name: 'worker-deployment',
      namespace: 'batch',
      cluster: 'vllm-d',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
    {
      name: 'nginx-ingress',
      namespace: 'ingress',
      cluster: 'prod-east',
      issue: 'Host network enabled',
      severity: 'medium',
      details: 'Pod using host network namespace',
    },
    {
      name: 'monitoring-agent',
      namespace: 'monitoring',
      cluster: 'staging',
      issue: 'Missing security context',
      severity: 'low',
      details: 'No security context defined',
    },
  ]
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

function getDemoPods(): PodInfo[] {
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

function getDemoDeployments(): Deployment[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'running',
      replicas: 3,
      readyReplicas: 3,
      updatedReplicas: 3,
      availableReplicas: 3,
      progress: 100,
      image: 'api-gateway:v2.4.1',
      age: '5d',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'deploying',
      replicas: 3,
      readyReplicas: 2,
      updatedReplicas: 3,
      availableReplicas: 2,
      progress: 67,
      image: 'worker:v1.8.0',
      age: '2h',
    },
    {
      name: 'frontend',
      namespace: 'web',
      cluster: 'prod-west',
      status: 'failed',
      replicas: 3,
      readyReplicas: 1,
      updatedReplicas: 3,
      availableReplicas: 1,
      progress: 33,
      image: 'frontend:v3.0.0',
      age: '30m',
    },
    {
      name: 'cache-redis',
      namespace: 'data',
      cluster: 'staging',
      status: 'running',
      replicas: 1,
      readyReplicas: 1,
      updatedReplicas: 1,
      availableReplicas: 1,
      progress: 100,
      image: 'redis:7.2.0',
      age: '14d',
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
