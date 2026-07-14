// MCP hook types — GPU / accelerator / operator status.
// Split out from types.ts to keep each file under the max-lines limit.

// AcceleratorType represents the category of accelerator
export type AcceleratorType = 'GPU' | 'TPU' | 'AIU' | 'XPU'

/**
 * Scheduling-gating taint on a GPU node (issue #8172).
 * Only taint effects that actually gate scheduling (`NoSchedule`, `NoExecute`)
 * are surfaced by the backend — `PreferNoSchedule` is advisory and is omitted.
 */
export interface GPUTaint {
  key: string
  value?: string
  effect: string  // 'NoSchedule' | 'NoExecute'
}

export interface GPUNode {
  name: string
  cluster: string
  gpuType: string           // Display name of accelerator (e.g., "NVIDIA A100", "Intel Gaudi2", "IBM AIU")
  gpuCount: number          // Number of accelerators
  gpuAllocated: number      // Number of allocated accelerators
  acceleratorType?: AcceleratorType  // GPU, TPU, AIU, or XPU
  /** Scheduling-gating taints on the underlying node (issue #8172). */
  taints?: GPUTaint[]
  // Enhanced GPU info from NVIDIA GPU Feature Discovery
  gpuMemoryMB?: number
  gpuFamily?: string
  cudaDriverVersion?: string
  cudaRuntimeVersion?: string
  migCapable?: boolean
  migStrategy?: string
  manufacturer?: string     // Manufacturer (NVIDIA, AMD, Intel, Google, IBM)
}

// GPU Node Health Check types (proactive monitoring)
export interface GPUNodeHealthCheck {
  name: string
  passed: boolean
  message?: string
}

export interface GPUNodeHealthStatus {
  nodeName: string
  cluster: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  gpuCount: number
  gpuType: string
  checks: GPUNodeHealthCheck[]
  issues: string[]
  stuckPods: number
  checkedAt: string
}

export interface GPUHealthCheckResult {
  nodeName: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  gpuCount?: number
  checks: GPUNodeHealthCheck[]
  issues: string[]
}

export interface GPUHealthCronJobStatus {
  installed: boolean
  cluster: string
  namespace?: string
  schedule?: string
  tier: number
  version: number
  updateAvailable: boolean
  lastRun?: string
  lastResult?: string
  nextRun?: string
  canInstall: boolean
  activeJobs: number
  failedJobs: number
  successJobs: number
  lastResults?: GPUHealthCheckResult[]
}

// NVIDIA Operator Status types
export interface OperatorComponent {
  name: string
  status: string
  reason?: string
}

export interface GPUOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  driverVersion?: string
  cudaVersion?: string
  namespace?: string
}

export interface NetworkOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  namespace?: string
}

export interface NVIDIAOperatorStatus {
  cluster: string
  gpuOperator?: GPUOperatorInfo
  networkOperator?: NetworkOperatorInfo
}
