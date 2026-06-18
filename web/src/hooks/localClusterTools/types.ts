export interface LocalClusterTool {
  name: 'kind' | 'k3d' | 'minikube' | 'vcluster'
  installed: boolean
  version?: string
  path?: string
}

export interface VClusterInstance {
  name: string
  namespace: string
  status: string
  connected: boolean
  context?: string
}

/** Status of vCluster on a specific host cluster */
export interface VClusterClusterStatus {
  context: string
  name: string
  hasCRD: boolean
  version?: string
  instances: number
  vclusters?: VClusterInstance[]
}

export interface LocalCluster {
  name: string
  tool: string
  status: 'running' | 'stopped' | 'unknown'
}

export interface CreateClusterResult {
  status: 'creating' | 'error'
  message: string
}

export type VClusterActionKind = 'connect' | 'disconnect' | 'delete'
export type VClusterActionState = 'pending' | 'success' | 'error'

export interface VClusterActionFeedback {
  action: VClusterActionKind
  name: string
  namespace: string
  state: VClusterActionState
  message?: string
}
