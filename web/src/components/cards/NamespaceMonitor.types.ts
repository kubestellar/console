export type ResourceType = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'pvcs' | 'jobs'

export type ChangeType = 'added' | 'modified' | 'deleted' | 'error' | null

export interface ResourceChange {
  type: ChangeType
  timestamp: number
  resourceType: ResourceType
  name: string
  namespace: string
  cluster: string
  details?: string
}

export interface ResourceSnapshot {
  key: string
  name: string
  namespace: string
  cluster: string
  status?: string
  replicas?: number
  readyReplicas?: number
}

export interface PodItem {
  name: string
  namespace: string
  status: string
  restarts: number
}

export interface DeploymentItem {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  status?: string
}

export interface ServiceItem {
  name: string
  namespace: string
  type: string
}

export interface ConfigMapItem {
  name: string
  namespace: string
  dataCount?: number
}

export interface SecretItem {
  name: string
  namespace: string
  type?: string
}

export interface PVCItem {
  name: string
  namespace: string
  status: string
}

export interface JobItem {
  name: string
  namespace: string
  status: string
}

export interface NamespaceData {
  pods: PodItem[]
  deployments: DeploymentItem[]
  services: ServiceItem[]
  configmaps: ConfigMapItem[]
  secrets: SecretItem[]
  pvcs: PVCItem[]
  jobs: JobItem[]
  hasIssues: boolean
}

export interface ModalResource {
  type: ResourceType
  name: string
  namespace: string
  cluster: string
}

export interface ResourceListItem {
  name: string
  status: string
  healthy: boolean
}

export interface ResourceChangeCounts {
  added: number
  modified: number
  deleted: number
  error: number
}
