export interface GitOpsAppConfig {
  name: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
}

export interface GitOpsApp extends GitOpsAppConfig {
  syncStatus: 'synced' | 'out-of-sync' | 'unknown' | 'checking' | 'error'
  healthStatus: 'healthy' | 'degraded' | 'progressing' | 'missing' | 'unknown'
  clusterAmbiguous?: boolean
  lastSyncTime?: string
  lastSyncTimeAgo?: string
  driftDetails?: string[]
}

export type DriftStatus = 'ok' | 'error'

export interface DriftResult {
  status: DriftStatus
  drifted: boolean
  resources: Array<{
    kind: string
    name: string
    namespace: string
    field: string
    gitValue: string
    clusterValue: string
  }>
  error?: string
}
