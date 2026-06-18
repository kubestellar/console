import type { LLMdServer } from '../useLLMd'

export interface LLMdStackComponent {
  name: string
  namespace: string
  cluster: string
  type: 'prefill' | 'decode' | 'both' | 'epp' | 'gateway'
  status: 'running' | 'pending' | 'error' | 'unknown'
  replicas: number
  readyReplicas: number
  model?: string
  podNames?: string[]
}

export type AutoscalerType = 'HPA' | 'WVA' | 'VPA' | null

export interface AutoscalerInfo {
  type: AutoscalerType
  name?: string
  minReplicas?: number
  maxReplicas?: number
  currentReplicas?: number
  desiredReplicas?: number
}

export interface LLMdStack {
  id: string
  name: string
  namespace: string
  cluster: string
  inferencePool?: string
  components: {
    prefill: LLMdStackComponent[]
    decode: LLMdStackComponent[]
    both: LLMdStackComponent[]
    epp: LLMdStackComponent | null
    gateway: LLMdStackComponent | null
  }
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  hasDisaggregation: boolean
  model?: string
  totalReplicas: number
  readyReplicas: number
  autoscaler?: AutoscalerInfo
}

export interface PodResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  status: { phase: string; containerStatuses?: Array<{ ready: boolean }> }
}

export interface ServiceResource {
  metadata: { name: string; namespace: string }
  spec: { ports?: Array<{ port: number }> }
}

export interface InferencePoolResource {
  metadata: { name: string; namespace: string }
  spec?: { selector?: { matchLabels?: Record<string, string> } }
}

export interface GatewayResource {
  metadata: { name: string; namespace: string }
  spec?: { gatewayClassName?: string }
  status?: { addresses?: Array<{ value: string }> }
}

export interface DeploymentResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  spec: { replicas?: number; template?: { metadata?: { labels?: Record<string, string> } } }
  status: { replicas?: number; readyReplicas?: number; availableReplicas?: number }
}

export interface HPAResource {
  metadata: { name: string; namespace: string }
  spec?: { minReplicas?: number; maxReplicas?: number }
  status?: { currentReplicas?: number; desiredReplicas?: number }
}

export interface WVAResource {
  metadata: { name: string; namespace: string }
  spec?: { minReplicas?: number; maxReplicas?: number; scaleTargetRef?: { namespace?: string } }
  status?: { currentReplicas?: number; desiredReplicas?: number; desiredOptimizedAlloc?: { numReplicas?: number } }
}

export interface VPAResource {
  metadata: { name: string; namespace: string }
}

export interface StackDiscoveryResult {
  stacks: LLMdStack[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  refetch: () => Promise<void>
  lastRefresh: Date | null
}

export type { LLMdServer }
