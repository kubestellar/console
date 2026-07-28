import type { ComponentType } from 'react'
import type { ResourceContext } from '../../../modals'

export interface Props {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'resources' | 'history' | 'diff' | 'gitops' | 'ai'

export interface ArgoResource {
  kind: string
  name: string
  namespace: string
  status: string
  health?: string
  syncWave?: number
}

export interface ArgoResourceRaw {
  kind: string
  name: string
  namespace?: string
  status: string
  health?: { status?: string }
  syncWave?: number
}

export interface SyncHistory {
  revision: string
  deployedAt: string
  status: string
  message?: string
}

export interface SyncHistoryRaw {
  revision?: string
  deployedAt: string
  deployStartedAt?: string
  source?: { repoURL?: string }
}

export interface ArgoIssue {
  name: string
  message: string
  severity: 'critical' | 'warning'
}

export interface SyncStatusStyle {
  bg: string
  text: string
  border: string
  icon: ComponentType<{ className?: string }>
}

export interface HealthStatusStyle {
  bg: string
  text: string
  border: string
}

export interface ArgoHeaderProps {
  cluster: string
  namespace: string
  syncStatus: string
  healthStatus: string
  syncStyle: SyncStatusStyle
  healthStyle: HealthStatusStyle
  drillToNamespace: (cluster: string, namespace: string) => void
  drillToCluster: (cluster: string) => void
}

export interface ArgoOverviewTabProps {
  appName: string
  project?: string
  targetRevision?: string
  repoURL?: string
  path?: string
  syncStatus: string
  healthStatus: string
  syncStyle: SyncStatusStyle
  healthStyle: HealthStatusStyle
  appResources: ArgoResource[] | null
  syncHistory: SyncHistory[] | null
  onResourceClick: (resource: ArgoResource) => void
  onShowMoreResources: () => void
}

export interface ArgoResourcesTabProps {
  resourcesLoading: boolean
  appResources: ArgoResource[] | null
  onResourceClick: (resource: ArgoResource) => void
}

export interface ArgoSyncHistoryPanelProps {
  historyLoading: boolean
  syncHistory: SyncHistory[] | null
}

export interface ArgoDiffTabProps {
  diffOutput: string | null
  diffLoading: boolean
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

export interface ArgoGitOpsTabProps {
  appName: string
  namespace: string
  syncStatus: string
  isSyncing: boolean
  syncResult: { success: boolean; error?: string } | null
  copiedField: string | null
  restartTimestamp: string
  onTriggerSync: (appName: string, namespace: string) => void
  onCopy: (field: string, value: string) => void
}

export interface ArgoAiTabProps {
  isAgentConnected: boolean
  aiAnalysisLoading: boolean
  aiAnalysis: string | null
  onDiagnose: () => void
}

export interface ArgoResourceContextInput {
  appName: string
  cluster: string
  namespace: string
  syncStatus: string
  healthStatus: string
}

export interface ArgoAIContext {
  resourceContext: ResourceContext
  issues: ArgoIssue[]
}
