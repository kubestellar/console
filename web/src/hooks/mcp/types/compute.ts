export type AcceleratorType = 'GPU' | 'TPU' | 'AIU' | 'XPU'

export interface GPUTaint { key: string; value?: string; effect: string }

export interface GPUNode {
  name: string; cluster: string; gpuType: string; gpuCount: number; gpuAllocated: number
  acceleratorType?: AcceleratorType; taints?: GPUTaint[]; gpuMemoryMB?: number; gpuFamily?: string
  cudaDriverVersion?: string; cudaRuntimeVersion?: string; migCapable?: boolean; migStrategy?: string; manufacturer?: string
}

export interface GPUNodeHealthCheck { name: string; passed: boolean; message?: string }

export interface GPUNodeHealthStatus {
  nodeName: string; cluster: string; status: 'healthy' | 'degraded' | 'unhealthy'; gpuCount: number; gpuType: string
  checks: GPUNodeHealthCheck[]; issues: string[]; stuckPods: number; checkedAt: string
}

export interface GPUHealthCheckResult {
  nodeName: string; status: 'healthy' | 'degraded' | 'unhealthy'; gpuCount?: number
  checks: GPUNodeHealthCheck[]; issues: string[]
}

export interface GPUHealthCronJobStatus {
  installed: boolean; cluster: string; namespace?: string; schedule?: string; tier: number; version: number
  updateAvailable: boolean; lastRun?: string; lastResult?: string; nextRun?: string; canInstall: boolean
  activeJobs: number; failedJobs: number; successJobs: number; lastResults?: GPUHealthCheckResult[]
}

export interface OperatorComponent { name: string; status: string; reason?: string }

export interface GPUOperatorInfo {
  installed: boolean; version?: string; state?: string; ready: boolean; components?: OperatorComponent[]
  driverVersion?: string; cudaVersion?: string; namespace?: string
}

export interface NetworkOperatorInfo {
  installed: boolean; version?: string; state?: string; ready: boolean; components?: OperatorComponent[]; namespace?: string
}

export interface NVIDIAOperatorStatus {
  cluster: string
  gpuOperator?: GPUOperatorInfo
  networkOperator?: NetworkOperatorInfo
}

export interface NodeCondition { type: string; status: string; reason?: string; message?: string }

export interface NodeInfo {
  name: string; cluster?: string; status: string; roles: string[]; internalIP?: string; externalIP?: string
  kubeletVersion: string; containerRuntime?: string; os?: string; architecture?: string; cpuCapacity: string
  memoryCapacity: string; storageCapacity?: string; podCapacity: string; conditions: NodeCondition[]
  labels?: Record<string, string>; taints?: string[]; age?: string; unschedulable: boolean
}

export interface ResourceQuota {
  name: string; namespace: string; cluster?: string; hard: Record<string, string>; used: Record<string, string>
  age?: string; labels?: Record<string, string>; annotations?: Record<string, string>
}

export interface ResourceQuotaSpec {
  cluster: string; name: string; namespace: string; hard: Record<string, string>
  labels?: Record<string, string>; annotations?: Record<string, string>; ensure_namespace?: boolean
}

export interface LimitRangeItem {
  type: string; default?: Record<string, string>; defaultRequest?: Record<string, string>
  max?: Record<string, string>; min?: Record<string, string>
}

export interface LimitRange {
  name: string; namespace: string; cluster?: string; limits: LimitRangeItem[]; age?: string; labels?: Record<string, string>
}

export interface Operator {
  name: string; namespace: string; version: string; status: 'Succeeded' | 'Failed' | 'Installing' | 'Upgrading'
  upgradeAvailable?: string; cluster?: string
}

export interface OperatorSubscription {
  name: string; namespace: string; channel: string; source: string; installPlanApproval: 'Automatic' | 'Manual'
  currentCSV: string; pendingUpgrade?: string; cluster?: string
}

export interface K8sRole {
  name: string; namespace?: string; cluster: string; isCluster: boolean; ruleCount: number
}

export interface K8sRoleBinding {
  name: string; namespace?: string; cluster: string; isCluster: boolean; roleName: string; roleKind: string
  subjects: Array<{ kind: 'User' | 'Group' | 'ServiceAccount'; name: string; namespace?: string }>
}

export interface K8sServiceAccountInfo {
  name: string; namespace: string; cluster: string; secrets?: string[]; roles?: string[]; createdAt?: string
}
