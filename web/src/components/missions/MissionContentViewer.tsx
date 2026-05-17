import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import {
  emitFixerViewed,
  emitFixerImported,
  emitFixerImportError,
  emitFixerLinkCopied,
} from '../../lib/analytics'
import type {
  MissionExport,
  BrowseEntry,
  FileScanResult,
} from '../../lib/missions/types'
import { validateMissionExport } from '../../lib/missions/types'
import { parseFileContent } from '../../lib/missions/fileParser'
import { fullScan } from '../../lib/missions/scanner/index'
import {
  fetchMissionContent,
  fetchDirectoryEntries,
  fetchNodeFileContent,
  getMissionShareUrl,
} from './browser'
import type { TreeNode, BrowserTab } from './browser'
import { ScanProgressOverlay } from './ScanProgressOverlay'
import { MissionDetailView } from './MissionDetailView'
import { ImproveMissionDialog } from './ImproveMissionDialog'
import { UnstructuredFilePreview } from './UnstructuredFilePreview'
import { MissionBrowserRecommendedTab } from './MissionBrowserRecommendedTab'
import { MissionBrowserInstallersTab } from './MissionBrowserInstallersTab'
import { MissionBrowserFixesTab } from './MissionBrowserFixesTab'
import { MissionBrowserScheduleActionTab } from './MissionBrowserScheduleActionTab'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  toWordSet,
  findBestDeepLinkMatch,
} from './missionBrowserDeepLink'
import { filterDirectoryEntries } from './missionBrowserFilterState'
import {
  MissionContentProvider,
  useMissionContentContext,
  type MissionContentController,
  type MissionFilePanelProps,
  type MissionSearchPanelProps,
  type UnstructuredContentState,
} from './MissionContentContext'
import { useToast } from '../ui/Toast'

interface UseMissionContentViewerOptions {
  isOpen: boolean
  activeTab: BrowserTab
  setActiveTab: (tab: BrowserTab) => void
  onClose: () => void
  onImport: (mission: MissionExport) => void
  initialMission?: string
  installerMissions: MissionExport[]
  fixerMissions: MissionExport[]
  revealMissionInTree: (mission: MissionExport) => Promise<void>
}

export function useMissionContentViewer({
  isOpen,
  activeTab,
  setActiveTab,
  onClose,
  onImport,
  initialMission,
  installerMissions,
  fixerMissions,
  revealMissionInTree,
}: UseMissionContentViewerOptions): MissionContentController {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [directoryEntries, setDirectoryEntries] = useState<BrowseEntry[]>([])
  const [selectedMission, setSelectedMission] = useState<MissionExport | null>(null)
  const [rawContent, setRawContent] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isMissionLoading, setIsMissionLoading] = useState(false)
  const [missionContentError, setMissionContentError] = useState<string | null>(null)
  const [unstructuredContent, setUnstructuredContent] = useState<UnstructuredContentState | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [showImproveDialog, setShowImproveDialog] = useState(false)
  const pendingImportRef = useRef<MissionExport | null>(null)
  const latestSelectionRef = useRef('')
  const deepLinkSlugRef = useRef<string | null>(null)

  const clearSelectedMission = useCallback(() => {
    setSelectedMission(null)
    setRawContent(null)
    setShowRaw(false)
    setMissionContentError(null)
    setShowImproveDialog(false)
  }, [])

  const applySelectedFileContent = useCallback((node: TreeNode, raw: string) => {
    setRawContent(raw)
    setUnstructuredContent(null)

    if (node.repoOwner) {
      const format = node.name.endsWith('.yaml') || node.name.endsWith('.yml') ? 'yaml' as const : 'markdown' as const
      setUnstructuredContent({
        content: raw,
        format,
        preview: {
          detectedTitle: node.name,
          detectedSections: [],
          detectedCommands: [],
          detectedYamlBlocks: 1,
          detectedApiGroups: [],
          totalLines: raw.split('\n').length,
        },
        detectedProjects: [],
      })
      setSelectedMission(null)
      return
    }

    try {
      const parseResult = parseFileContent(raw, node.name)
      if (parseResult.type === 'structured') {
        const validation = validateMissionExport(parseResult.mission)
        if (validation.valid) {
          setSelectedMission(validation.data)
          emitFixerViewed(validation.data.title, validation.data.cncfProject)
        } else {
          setSelectedMission(parseResult.mission)
          emitFixerViewed(parseResult.mission.title ?? node.name, parseResult.mission.cncfProject)
        }
      } else {
        setUnstructuredContent(parseResult)
        setSelectedMission(null)
      }
    } catch {
      try {
        const parsed = JSON.parse(raw)
        const validation = validateMissionExport(parsed)
        setSelectedMission(validation.valid ? validation.data : (parsed as MissionExport))
      } catch {
        setSelectedMission(null)
      }
    }
  }, [])

  const selectCardMission = useCallback(async (mission: MissionExport) => {
    const selectionKey = `${mission.title}::${mission.type}`
    latestSelectionRef.current = selectionKey

    void revealMissionInTree(mission)

    setSelectedMission(mission)
    setIsMissionLoading(true)
    setMissionContentError(null)
    setRawContent(JSON.stringify(mission, null, 2))
    setShowRaw(false)

    try {
      const { mission: fullMission, raw } = await fetchMissionContent(mission)
      void revealMissionInTree(fullMission)
      if (latestSelectionRef.current === selectionKey) {
        setSelectedMission(fullMission)
        setRawContent(raw)
      }
    } catch {
      if (latestSelectionRef.current === selectionKey) {
        setMissionContentError('Failed to load full mission content. Steps may be incomplete.')
      }
    } finally {
      if (latestSelectionRef.current === selectionKey) {
        setIsMissionLoading(false)
      }
    }
  }, [revealMissionInTree])

  useEffect(() => {
    if (initialMission) {
      deepLinkSlugRef.current = initialMission.toLowerCase()
    }
  }, [initialMission])

  useEffect(() => {
    if (!isOpen) return

    clearSelectedMission()
    setDirectoryEntries([])
    setUnstructuredContent(null)
    setScanResult(null)
    setIsScanning(false)
    pendingImportRef.current = null
  }, [clearSelectedMission, isOpen])

  useEffect(() => {
    const slug = deepLinkSlugRef.current
    if (!slug || !isOpen || selectedMission) return

    const slugWordSet = toWordSet(slug)
    const installer = findBestDeepLinkMatch(installerMissions, slug, slugWordSet, true)
    if (installer.match) {
      setActiveTab('installers')
      void selectCardMission(installer.match)
      if (installer.score >= HIGH_CONFIDENCE_THRESHOLD) deepLinkSlugRef.current = null
      return
    }

    const fixer = findBestDeepLinkMatch(fixerMissions, slug, slugWordSet, false)
    if (fixer.match) {
      setActiveTab('fixes')
      void selectCardMission(fixer.match)
      if (fixer.score >= HIGH_CONFIDENCE_THRESHOLD) deepLinkSlugRef.current = null
      return
    }

    if (installerMissions.length === 0 && fixerMissions.length === 0 && activeTab !== 'installers') {
      setActiveTab('installers')
    }
  }, [activeTab, fixerMissions, installerMissions, isOpen, selectCardMission, selectedMission, setActiveTab])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        if (selectedMission) {
          clearSelectedMission()
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelectedMission, isOpen, onClose, selectedMission])

  const handleImport = useCallback(async (mission: MissionExport, raw?: string) => {
    pendingImportRef.current = mission
    setIsScanning(true)

    let resolvedMission = mission
    if ((!mission.steps || mission.steps.length === 0) && !raw) {
      try {
        const fetched = await fetchMissionContent(mission)
        resolvedMission = fetched.mission
        pendingImportRef.current = resolvedMission
      } catch {
        // Fall through with index-only mission — validation below will surface issues.
      }
    }

    let toValidate: unknown = resolvedMission
    if (raw) {
      try {
        toValidate = JSON.parse(raw)
      } catch {
        toValidate = resolvedMission
      }
    }
    const validation = validateMissionExport(toValidate)
    if (!validation.valid) {
      const missionTitle = (toValidate as Record<string, unknown>)?.title as string
        ?? (toValidate as Record<string, unknown>)?.name as string
        ?? 'unknown'
      emitFixerImportError(
        missionTitle,
        validation.errors.length,
        validation.errors[0]?.message ?? 'unknown',
      )
      setScanResult({
        valid: false,
        findings: validation.errors.map((error) => ({
          severity: 'error' as const,
          code: 'SCHEMA_VALIDATION',
          message: error.message,
          path: error.path ?? '',
        })),
        metadata: null,
      })
      return
    }

    const result = fullScan(validation.data)
    setScanResult(result)
  }, [])

  const handleScanComplete = useCallback((result: FileScanResult) => {
    const mission = pendingImportRef.current
    if (!mission) {
      setIsScanning(false)
      return
    }

    if (result.valid) {
      emitFixerImported(mission.title, mission.cncfProject)
      onImport(mission)
      showToast(t('missions.browser.importSuccess', { title: mission.title }), 'success')
      pendingImportRef.current = null
      setScanResult(null)
    }
    setIsScanning(false)
  }, [onImport, showToast, t])

  const handleScanDismiss = useCallback(() => {
    pendingImportRef.current = null
    setIsScanning(false)
    setScanResult(null)
  }, [])

  const handleImportDirectoryEntry = useCallback(async (entry: BrowseEntry) => {
    try {
      const { data: content } = await api.get<string>(`/api/missions/file?path=${encodeURIComponent(entry.path)}`)
      const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      const parsed = typeof content === 'string' ? JSON.parse(content) : content
      void handleImport(parsed, raw)
    } catch {
      // Ignore directory entry import failures — the detail view already exposes retries.
    }
  }, [handleImport])

  const selectNode = useCallback(async (node: TreeNode) => {
    setSelectedMission(null)
    setUnstructuredContent(null)
    setRawContent(null)
    setShowRaw(false)
    setMissionContentError(null)

    if (node.type === 'directory') {
      setLoading(true)
      try {
        const entries = await fetchDirectoryEntries(node)
        setDirectoryEntries(entries)
      } catch {
        setDirectoryEntries([])
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const content = node.source === 'local' ? (node.content ?? null) : await fetchNodeFileContent(node)
      if (content === null) return
      setDirectoryEntries([])
      applySelectedFileContent(node, content)
    } catch {
      setRawContent(null)
      setSelectedMission(null)
    } finally {
      setLoading(false)
    }
  }, [applySelectedFileContent])

  const handleCopyLink = useCallback((mission: MissionExport, event: React.MouseEvent) => {
    event.stopPropagation()
    const url = getMissionShareUrl(mission)
    void copyToClipboard(url)
    emitFixerLinkCopied(mission.title, mission.cncfProject)
  }, [])

  const resetContentView = useCallback(() => {
    clearSelectedMission()
    setUnstructuredContent(null)
  }, [clearSelectedMission])

  return {
    loading,
    selectedMission,
    rawContent,
    showRaw,
    setShowRaw,
    isMissionLoading,
    missionContentError,
    unstructuredContent,
    isScanning,
    scanResult,
    showImproveDialog,
    setShowImproveDialog,
    directoryEntries,
    selectNode,
    selectCardMission,
    handleImport,
    handleImportDirectoryEntry,
    handleScanComplete,
    handleScanDismiss,
    handleCopyLink,
    clearSelectedMission,
    resetContentView,
  }
}

interface MissionContentViewerProps {
  searchPanel: MissionSearchPanelProps
  filePanel: MissionFilePanelProps
  content: MissionContentController
}

function MissionFilePanel() {
  const { searchPanel, filePanel, content } = useMissionContentContext()

  if (content.selectedMission) {
    return (
      <>
        <MissionDetailView
          mission={content.selectedMission}
          rawContent={content.rawContent}
          showRaw={content.showRaw}
          loading={content.isMissionLoading}
          error={content.missionContentError}
          onRetry={() => content.selectCardMission(content.selectedMission!)}
          onToggleRaw={() => content.setShowRaw(!content.showRaw)}
          onImport={() => content.handleImport(content.selectedMission!, content.rawContent ?? undefined)}
          onBack={content.clearSelectedMission}
          onImprove={content.selectedMission.missionClass === 'install' ? () => content.setShowImproveDialog(true) : undefined}
          matchScore={searchPanel.recommendations.find((match) => match.mission.title === content.selectedMission?.title)?.matchPercent}
          shareUrl={getMissionShareUrl(content.selectedMission)}
        />
        {content.showImproveDialog && (
          <ImproveMissionDialog
            mission={content.selectedMission}
            isOpen={content.showImproveDialog}
            onClose={() => content.setShowImproveDialog(false)}
          />
        )}
      </>
    )
  }

  if (!content.unstructuredContent) {
    return null
  }

  const parts = filePanel.selectedPath?.split('/') ?? []
  const kubaraChartName = filePanel.selectedPath?.startsWith('kubara/') && parts[1] && parts[1].length > 0
    ? parts[1]
    : undefined

  return (
    <UnstructuredFilePreview
      content={content.unstructuredContent.content}
      format={content.unstructuredContent.format}
      preview={content.unstructuredContent.preview}
      detectedProjects={content.unstructuredContent.detectedProjects}
      fileName={filePanel.selectedPath?.split('/').pop() ?? 'file'}
      onConvert={(mission) => {
        content.resetContentView()
        void content.selectCardMission(mission)
      }}
      onBack={() => {
        content.resetContentView()
        filePanel.onClearSelectedPath()
      }}
      kubaraChartName={kubaraChartName}
      onUseInMissionControl={filePanel.onUseInMissionControl}
    />
  )
}

function MissionSearchPanel() {
  const { searchPanel, filePanel, content, filteredEntries } = useMissionContentContext()

  if (content.selectedMission || content.unstructuredContent) {
    return null
  }

  if (searchPanel.activeTab === 'recommended') {
    return (
      <MissionBrowserRecommendedTab
        tokenError={searchPanel.tokenError}
        missionFetchError={searchPanel.missionFetchError}
        loadingRecommendations={searchPanel.loadingRecommendations}
        searchProgress={searchPanel.searchProgress}
        hasCluster={searchPanel.hasCluster}
        recommendations={searchPanel.recommendations}
        filteredRecommendations={searchPanel.filteredRecommendations}
        onSelectMission={content.selectCardMission}
        onImportMission={content.handleImport}
        onCopyLink={content.handleCopyLink}
        loading={content.loading}
        filteredEntries={filteredEntries}
        selectedPath={filePanel.selectedPath}
        selectedNode={filePanel.selectedNode}
        viewMode={filePanel.viewMode}
        onImportDirectoryEntry={content.handleImportDirectoryEntry}
        onToggleNode={filePanel.onToggleNode}
        onSelectNode={filePanel.onSelectNode}
      />
    )
  }

  if (searchPanel.activeTab === 'installers') {
    return (
      <MissionBrowserInstallersTab
        installerMissions={searchPanel.installerMissions}
        filteredInstallers={searchPanel.filteredInstallers}
        loadingInstallers={searchPanel.loadingInstallers}
        missionFetchError={searchPanel.missionFetchError}
        installerSearch={searchPanel.installerSearch}
        onInstallerSearchChange={searchPanel.onInstallerSearchChange}
        globalSearchActive={Boolean(searchPanel.searchQuery)}
        globalSearchQuery={searchPanel.searchQuery}
        installerCategoryFilter={searchPanel.installerCategoryFilter}
        onInstallerCategoryFilterChange={searchPanel.onInstallerCategoryFilterChange}
        installerMaturityFilter={searchPanel.installerMaturityFilter}
        onInstallerMaturityFilterChange={searchPanel.onInstallerMaturityFilterChange}
        viewMode={filePanel.viewMode}
        onSelectMission={content.selectCardMission}
        onImportMission={content.handleImport}
        onCopyLink={content.handleCopyLink}
      />
    )
  }

  if (searchPanel.activeTab === 'fixes') {
    return (
      <MissionBrowserFixesTab
        fixerMissions={searchPanel.fixerMissions}
        filteredFixers={searchPanel.filteredFixers}
        loadingFixers={searchPanel.loadingFixers}
        missionFetchError={searchPanel.missionFetchError}
        fixerSearch={searchPanel.fixerSearch}
        onFixerSearchChange={searchPanel.onFixerSearchChange}
        globalSearchActive={Boolean(searchPanel.searchQuery)}
        globalSearchQuery={searchPanel.searchQuery}
        fixerTypeFilter={searchPanel.fixerTypeFilter}
        onFixerTypeFilterChange={searchPanel.onFixerTypeFilterChange}
        viewMode={filePanel.viewMode}
        onSelectMission={content.selectCardMission}
        onImportMission={content.handleImport}
        onCopyLink={content.handleCopyLink}
      />
    )
  }

  return <MissionBrowserScheduleActionTab isActive={searchPanel.activeTab === 'schedule'} />
}

export function MissionContentViewer({ searchPanel, filePanel, content }: MissionContentViewerProps) {
  const filteredEntries = useMemo(
    () => filterDirectoryEntries(content.directoryEntries, searchPanel.searchQuery),
    [content.directoryEntries, searchPanel.searchQuery],
  )

  return (
    <MissionContentProvider
      searchPanel={searchPanel}
      filePanel={filePanel}
      content={content}
      filteredEntries={filteredEntries}
    >
      <div data-testid="mission-grid" className="flex-1 flex flex-col overflow-hidden relative bg-background">
        <ScanProgressOverlay
          isScanning={content.isScanning}
          result={content.scanResult}
          onComplete={content.handleScanComplete}
          onDismiss={content.handleScanDismiss}
        />

        <div className="flex-1 overflow-y-auto p-4">
          <MissionFilePanel />
          <MissionSearchPanel />
        </div>
      </div>
    </MissionContentProvider>
  )
}
