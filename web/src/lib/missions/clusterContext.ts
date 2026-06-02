export interface ClusterContext {
  name: string
  provider?: string
  version?: string
  resources: string[]
  issues: string[]
  labels: Record<string, string>
}
