export interface AppSummary {
  namespace: string
  cluster: string
  deploymentCount: number
  podIssues: number
  deploymentIssues: number
  status: 'healthy' | 'warning' | 'error'
  type: 'namespace'
}

export interface DeploymentSummary {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  type: 'deployment'
  image?: string
}

export type WorkloadItem = AppSummary | DeploymentSummary
