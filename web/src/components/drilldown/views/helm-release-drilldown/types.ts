import type { ResourceContext } from '../../../modals'

export interface Props {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'values' | 'history' | 'resources' | 'ai'

export interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
}

export interface HelmHistory {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

export interface HelmHistoryRaw {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

export interface ParsedResource {
  kind: string
  name: string
  namespace: string
}

export interface StatusStyle {
  bg: string
  text: string
  border: string
}

export interface HelmOverviewPanelProps {
  releaseName: string
  chartName?: string
  chartVersion?: string
  appVersion?: string
  releaseInfo: HelmRelease | null
  releaseRevision?: string
  releaseHistory: HelmHistory[] | null
  parsedResources: ParsedResource[]
  onResourceClick: (resource: ParsedResource) => void
  onShowMoreResources: () => void
  helmActionLoading: boolean
  onConfirmUninstall: () => void
}

export interface HelmValuesPanelProps {
  releaseValues: string | null
  valuesLoading: boolean
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

export interface HelmReleaseHistoryTableProps {
  historyLoading: boolean
  releaseHistory: HelmHistory[] | null
  releaseInfo: HelmRelease | null
  releaseRevision?: string
  helmActionLoading: boolean
  onConfirmRollback: (revision: number) => void
}

export interface HelmResourcesPanelProps {
  resourcesLoading: boolean
  parsedResources: ParsedResource[]
  onResourceClick: (resource: ParsedResource) => void
}

export interface HelmAiPanelProps {
  isAgentConnected: boolean
  aiAnalysisLoading: boolean
  aiAnalysis: string | null
  onDiagnose: () => void
}

export interface ConfirmActionState {
  type: 'rollback' | 'uninstall'
  label: string
  revision?: number
}

export interface HelmIssue {
  name: string
  message: string
  severity: 'warning'
}

export interface HelmAIContext {
  resourceContext: ResourceContext
  issues: HelmIssue[]
}

export interface HelmResourceContextInput {
  releaseName: string
  cluster: string
  namespace: string
  releaseStatus: string
}
