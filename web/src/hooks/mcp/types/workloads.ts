export interface ContainerInfo {
  name: string; image: string; ready: boolean; state: 'running' | 'waiting' | 'terminated'
  reason?: string; message?: string; gpuRequested?: number
}

export interface PodInfo {
  name: string; namespace: string; cluster?: string; status: string; ready: string; restarts: number; age: string; node?: string
  labels?: Record<string, string>; annotations?: Record<string, string>; containers?: ContainerInfo[]
  cpuRequestMillis?: number; cpuLimitMillis?: number; memoryRequestBytes?: number; memoryLimitBytes?: number; gpuRequest?: number
  cpuUsageMillis?: number; memoryUsageBytes?: number; metricsAvailable?: boolean
}

export interface PodIssue {
  name: string; namespace: string; cluster?: string; status: string; reason?: string; issues: string[]; restarts: number
}

export interface DeploymentIssue {
  name: string; namespace: string; cluster?: string; replicas: number; readyReplicas: number; reason?: string; message?: string
}

export interface Deployment {
  name: string; namespace: string; cluster?: string; status: 'running' | 'deploying' | 'failed'; replicas: number
  readyReplicas: number; updatedReplicas: number; availableReplicas: number; progress: number; image?: string; age?: string
  labels?: Record<string, string>; annotations?: Record<string, string>; reason?: string; message?: string
}

export interface Job {
  name: string; namespace: string; cluster?: string; status: string; completions: string; duration?: string; age?: string
  labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface HPA {
  name: string; namespace: string; cluster?: string; reference: string; minReplicas: number; maxReplicas: number
  currentReplicas: number; targetCPU?: string; currentCPU?: string; age?: string; labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface ConfigMap {
  name: string; namespace: string; cluster?: string; dataCount: number; age?: string; labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface Secret {
  name: string; namespace: string; cluster?: string; type: string; dataCount: number; age?: string; labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface ServiceAccount {
  name: string; namespace: string; cluster?: string; secrets?: string[]; imagePullSecrets?: string[]; age?: string
  labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface ReplicaSet {
  name: string; namespace: string; cluster?: string; replicas: number; readyReplicas: number; ownerName?: string; ownerKind?: string
  age?: string; labels?: Record<string, string>
}

export interface StatefulSet {
  name: string; namespace: string; cluster?: string; replicas: number; readyReplicas: number; status: string; image?: string
  age?: string; labels?: Record<string, string>
}

export interface DaemonSet {
  name: string; namespace: string; cluster?: string; desiredScheduled: number; currentScheduled: number; ready: number
  status: string; age?: string; labels?: Record<string, string>
}

export interface CronJob {
  name: string; namespace: string; cluster?: string; schedule: string; suspend: boolean; active: number; lastSchedule?: string
  age?: string; labels?: Record<string, string>
}

export interface SecurityIssue {
  name: string; namespace: string; cluster?: string; issue: string; severity: 'high' | 'medium' | 'low'; details?: string
}

export interface GitOpsDrift {
  resource: string; namespace: string; cluster: string; kind: string; driftType: 'modified' | 'deleted' | 'added'
  gitVersion: string; details?: string; severity: 'high' | 'medium' | 'low'
}
