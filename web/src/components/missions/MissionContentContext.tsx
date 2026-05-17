import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ApiGroupMapping } from '../../lib/missions/apiGroupMapping'
import type { UnstructuredPreview } from '../../lib/missions/fileParser'
import type {
  BrowseEntry,
  FileScanResult,
  MissionExport,
  MissionMatch,
} from '../../lib/missions/types'
import type { BrowserTab, TreeNode, ViewMode } from './browser'

export interface UnstructuredContentState {
  content: string
  format: 'yaml' | 'markdown'
  preview: UnstructuredPreview
  detectedProjects: ApiGroupMapping[]
}

export interface MissionContentController {
  loading: boolean
  selectedMission: MissionExport | null
  rawContent: string | null
  showRaw: boolean
  setShowRaw: (value: boolean) => void
  isMissionLoading: boolean
  missionContentError: string | null
  unstructuredContent: UnstructuredContentState | null
  isScanning: boolean
  scanResult: FileScanResult | null
  showImproveDialog: boolean
  setShowImproveDialog: (value: boolean) => void
  directoryEntries: BrowseEntry[]
  selectNode: (node: TreeNode) => Promise<void>
  selectCardMission: (mission: MissionExport) => Promise<void>
  handleImport: (mission: MissionExport, raw?: string) => Promise<void>
  handleImportDirectoryEntry: (entry: BrowseEntry) => Promise<void>
  handleScanComplete: (result: FileScanResult) => void
  handleScanDismiss: () => void
  handleCopyLink: (mission: MissionExport, event: React.MouseEvent) => void
  clearSelectedMission: () => void
  resetContentView: () => void
}

export interface MissionSearchPanelProps {
  activeTab: BrowserTab
  searchQuery: string
  tokenError: 'rate_limited' | 'token_invalid' | null
  missionFetchError: string | null
  loadingRecommendations: boolean
  searchProgress: {
    step: string
    detail: string
    found: number
    scanned: number
  }
  hasCluster: boolean
  recommendations: MissionMatch[]
  filteredRecommendations: MissionMatch[]
  installerMissions: MissionExport[]
  filteredInstallers: MissionExport[]
  loadingInstallers: boolean
  installerSearch: string
  onInstallerSearchChange: (value: string) => void
  installerCategoryFilter: string
  onInstallerCategoryFilterChange: (value: string) => void
  installerMaturityFilter: string
  onInstallerMaturityFilterChange: (value: string) => void
  fixerMissions: MissionExport[]
  filteredFixers: MissionExport[]
  loadingFixers: boolean
  fixerSearch: string
  onFixerSearchChange: (value: string) => void
  fixerTypeFilter: string
  onFixerTypeFilterChange: (value: string) => void
}

export interface MissionFilePanelProps {
  selectedPath: string | null
  selectedNode: TreeNode | null
  viewMode: ViewMode
  onToggleNode: (node: TreeNode) => void
  onSelectNode: (node: TreeNode) => void
  onClearSelectedPath: () => void
  onUseInMissionControl?: (chartName: string) => void
}

export interface MissionContentContextValue {
  searchPanel: MissionSearchPanelProps
  filePanel: MissionFilePanelProps
  content: MissionContentController
  filteredEntries: BrowseEntry[]
}

const MissionContentContext = createContext<MissionContentContextValue | null>(null)

interface MissionContentProviderProps extends MissionContentContextValue {
  children: ReactNode
}

export function MissionContentProvider({ children, ...value }: MissionContentProviderProps) {
  return (
    <MissionContentContext.Provider value={value}>
      {children}
    </MissionContentContext.Provider>
  )
}

export function useMissionContentContext(): MissionContentContextValue {
  const context = useContext(MissionContentContext)
  if (!context) {
    throw new Error('useMissionContentContext must be used within a MissionContentProvider')
  }
  return context
}
