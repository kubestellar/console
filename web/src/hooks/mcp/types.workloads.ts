// MCP hook types — workload resources (pods, deployments, jobs, replicasets, statefulsets, daemonsets, cronjobs, HPA).
// Split out from types.ts to keep each file under the max-lines limit.

export interface ContainerInfo {
  name: string
  image: string
  ready: boolean
  state: 'running' | 'waiting' | 'terminated'
  reason?: string
  message?: string
  gpuRequested?: number  // Number of GPUs requested by this container
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
  labels?: Record<string, string>
  annotations?: Record<string, string>
  containers?: ContainerInfo[]
  // Resource requests (sum of all containers)
  cpuRequestMillis?: number    // CPU request in millicores
  cpuLimitMillis?: number      // CPU limit in millicores
  memoryRequestBytes?: number  // Memory request in bytes
  memoryLimitBytes?: number    // Memory limit in bytes
  gpuRequest?: number          // Total GPU request
  // Actual resource usage (from metrics API, if available)
  cpuUsageMillis?: number      // Actual CPU usage in millicores
  memoryUsageBytes?: number    // Actual memory usage in bytes
  metricsAvailable?: boolean   // Whether metrics API data is available
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
  labels?: Record<string, string>
  annotations?: Record<string, string>
  reason?: string
  message?: string
}

export interface Job {
  name: string
  namespace: string
  cluster?: string
  status: string // Running, Complete, Failed
  completions: string
  duration?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface HPA {
  name: string
  namespace: string
  cluster?: string
  reference: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  targetCPU?: string
  currentCPU?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ReplicaSet {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  ownerName?: string
  ownerKind?: string
  age?: string
  labels?: Record<string, string>
}

export interface StatefulSet {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  status: string
  image?: string
  age?: string
  labels?: Record<string, string>
}

export interface DaemonSet {
  name: string
  namespace: string
  cluster?: string
  desiredScheduled: number
  currentScheduled: number
  ready: number
  status: string
  age?: string
  labels?: Record<string, string>
}

export interface CronJob {
  name: string
  namespace: string
  cluster?: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule?: string
  age?: string
  labels?: Record<string, string>
}
