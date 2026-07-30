export type MessageType = 'kubectl' | 'health' | 'clusters' | 'result' | 'error'

export interface Message {
  id: string
  type: MessageType
  payload?: unknown
}

export interface KubectlRequest {
  context?: string
  namespace?: string
  args: string[]
  confirmed?: boolean
}

export interface KubectlResponse {
  output: string
  exitCode: number
  error?: string
  requiresConfirmation?: boolean
  command?: string
}

export interface KubectlExecOptions {
  context?: string
  namespace?: string
  timeout?: number
  priority?: boolean
}

export interface PendingRequest {
  resolve: (response: KubectlResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface QueuedRequest {
  args: string[]
  options: KubectlExecOptions
  resolve: (response: KubectlResponse) => void
  reject: (error: Error) => void
}

export type KubectlWebSocketMode = 'unknown' | 'local' | 'backend'

export interface KubeNode {
  metadata: { name: string; labels?: Record<string, string> }
  status: {
    conditions?: NodeCondition[]
    allocatable?: {
      cpu?: string
      memory?: string
      'ephemeral-storage'?: string
      pods?: string
    }
    capacity?: {
      cpu?: string
      memory?: string
      'ephemeral-storage'?: string
      pods?: string
    }
  }
}

export interface NodeCondition {
  type: string
  status: string
  reason?: string
}

export interface KubeEvent {
  type: string
  reason: string
  message: string
  involvedObject: { kind: string; name: string }
  metadata: { namespace: string }
  count?: number
  firstTimestamp?: string
  lastTimestamp?: string
}

export interface KubeService {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  spec: {
    type: string
    clusterIP: string
    externalIPs?: string[]
    ports?: Array<{
      port: number
      protocol: string
      nodePort?: number
      name?: string
    }>
    selector?: Record<string, string>
  }
  status?: {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>
    }
  }
}

export interface KubectlServiceResult {
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: string
  externalIP: string
  externalIPs: string[]
  lbStatus: string
  selector?: Record<string, string>
}

export interface KubeDeployment {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: {
    replicas?: number
    template?: { spec?: { containers?: Array<{ image?: string }> } }
  }
  status: {
    readyReplicas?: number
    updatedReplicas?: number
    availableReplicas?: number
  }
}

export interface NodeInfo {
  name: string
  ready: boolean
  roles: string[]
  cpuCores?: number
  memoryBytes?: number
  storageBytes?: number
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  reachable: boolean
  nodeCount: number
  readyNodes: number
  podCount: number
  cpuCores?: number
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  cpuUsageMillicores?: number
  cpuUsageCores?: number
  memoryBytes?: number
  memoryGB?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  memoryUsageBytes?: number
  memoryUsageGB?: number
  metricsAvailable?: boolean
  storageBytes?: number
  storageGB?: number
  pvcCount?: number
  pvcBoundCount?: number
  lastSeen?: string
  errorMessage?: string
}

export interface PodIssue {
  name: string
  namespace: string
  cluster: string
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
  cluster: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export interface Deployment {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progress: number
  image?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  reason?: string
  message?: string
}
