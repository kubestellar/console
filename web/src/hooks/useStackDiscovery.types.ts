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
  id: string                    // Format: "namespace@cluster"
  name: string                  // Display name (namespace or InferencePool name)
  namespace: string             // Primary namespace
  cluster: string
  inferencePool?: string        // InferencePool CR name if exists
  components: {
    prefill: LLMdStackComponent[]
    decode: LLMdStackComponent[]
    both: LLMdStackComponent[]   // Unified serving pods
    epp: LLMdStackComponent | null
    gateway: LLMdStackComponent | null
  }
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  hasDisaggregation: boolean    // true if prefill.length > 0 && decode.length > 0
  model?: string                // Primary model name
  totalReplicas: number
  readyReplicas: number
  autoscaler?: AutoscalerInfo   // Autoscaler info if detected
}

export interface PodResource {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  status: {
    phase: string
    containerStatuses?: Array<{
      ready: boolean
    }>
  }
}

export interface ServiceResource {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    ports?: Array<{
      port: number
    }>
  }
}

export interface DeploymentResource {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  spec: {
    replicas?: number
  }
  status: {
    replicas?: number
    readyReplicas?: number
  }
}

export interface InferencePoolCRD {
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    model?: string
  }
}
