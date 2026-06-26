import type {
  MissionControlState,
  PayloadProject,
  ClusterAssignment,
  DeployPhase,
} from './types'

export interface PersistedStateEntry {
  state: Partial<MissionControlState>
  savedAt: number
  schemaVersion?: number
}

export interface MissionConversationMessage {
  role: 'user' | 'assistant' | 'system' | string
  content: string
}

export interface BalancedBlockScanFrame {
  startIndex: number
  opener: '{' | '['
  expectedCloser: '}' | ']'
}

export interface BalancedBlockScanCursor {
  lastScanIndex: number
  inString: boolean
  escape: boolean
  frames: BalancedBlockScanFrame[]
  completedBlocks: string[]
}

export interface AvailableCluster {
  name: string
  context?: string
  server?: string
  distribution?: string
  cpuCores?: number
  memoryGB?: number
  storageGB?: number
  cpuUsageCores?: number
  cpuRequestsCores?: number
  memoryUsageGB?: number
  memoryRequestsGB?: number
}

export interface InstalledProjectsSummary {
  installedProjects: Set<string>
  installedOnCluster: Map<string, Set<string>>
}

export interface SuggestionPromptResult {
  prompt: string
  kubaraChartNames: Set<string>
}

export interface AssignmentResponse {
  assignments?: ClusterAssignment[]
  phases?: DeployPhase[]
  warnings?: string[]
}

export interface ProjectResponse {
  projects?: PayloadProject[]
}
