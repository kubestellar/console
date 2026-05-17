/**
 * Mission Browser
 *
 * Full-screen file-explorer-style dialog for browsing and importing mission files.
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { useClusterContext } from '../../hooks/useClusterContext'
import { useMobile } from '../../hooks/useMobile'
import type { MissionExport } from '../../lib/missions/types'
import type { TreeNode, ViewMode, BrowserTab } from './browser'
import { isMissionFile } from './missionBrowserConstants'
import { MissionBrowserTopBar } from './MissionBrowserTopBar'
import { MissionBrowserFilterPanel } from './MissionBrowserFilterPanel'
import { MissionBrowserTabBar } from './MissionBrowserTabBar'
import { MissionBrowserSidebar } from './MissionBrowserSidebar'
import { MissionContentViewer, useMissionContentViewer } from './MissionContentViewer'
import { useMissionFilters } from './useMissionFilters'
import { useMissionRecommendations } from './useMissionRecommendations'
import { useMissionTree } from './useMissionTree'
import { useMissionWatchedSources } from './useMissionWatchedSources'

const MODAL_NAVBAR_GAP_PX = 16
const MODAL_TOP_INSET_PX = NAVBAR_HEIGHT_PX + MODAL_NAVBAR_GAP_PX
const MODAL_SIDE_INSET_PX = 16
const COLLAPSIBLE_FILTERS_BREAKPOINT_PX = 640
const TREE_REFRESH_DELAY_MS = 50

interface MissionBrowserProps {
  isOpen: boolean
  onClose: () => void
  onImport: (mission: MissionExport) => void
  initialMission?: string
  onUseInMissionControl?: (chartName: string) => void
}

export function MissionBrowser({ isOpen, onClose, onImport, initialMission, onUseInMissionControl }: MissionBrowserProps) {
  const { user, isAuthenticated } = useAuth()
  const { clusterContext } = useClusterContext()
  const { isMobile } = useMobile()
  const [isSmallScreen, setIsSmallScreen] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < COLLAPSIBLE_FILTERS_BREAKPOINT_PX,
  )
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'list' : 'grid')
  const [showFilters, setShowFilters] = useState(!isMobile)
  const [activeTab, setActiveTab] = useState<BrowserTab>('recommended')
  const [isDragging, setIsDragging] = useState(false)

  const watchedSources = useMissionWatchedSources()
  const recommendations = useMissionRecommendations(isOpen, clusterContext)
  const filters = useMissionFilters({
    recommendations: recommendations.recommendations,
    installerMissions: recommendations.installerMissions,
    fixerMissions: recommendations.fixerMissions,
  })
  const tree = useMissionTree({
    isOpen,
    isAuthenticated,
    user,
    watchedRepos: watchedSources.watchedRepos,
    watchedPaths: watchedSources.watchedPaths,
  })
  const content = useMissionContentViewer({
    isOpen,
    activeTab,
    setActiveTab,
    onClose,
    onImport,
    initialMission,
    installerMissions: recommendations.installerMissions,
    fixerMissions: recommendations.fixerMissions,
    revealMissionInTree: tree.revealMissionInTree,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(`(max-width: ${COLLAPSIBLE_FILTERS_BREAKPOINT_PX - 1}px)`)
    const handleChange = (event: MediaQueryListEvent) => setIsSmallScreen(event.matches)

    setIsSmallScreen(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    setViewMode(isMobile ? 'list' : 'grid')
    setShowFilters(!isMobile)
  }, [isMobile])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  const handleTabChange = (tab: BrowserTab) => {
    content.resetContentView()
    setActiveTab(tab)
  }

  const handleSelectNode = async (node: TreeNode) => {
    tree.setSelectedPath(node.id)
    await content.selectNode(node)
  }

  const handleRefreshNode = (node: TreeNode) => {
    tree.refreshNode(node)
    window.setTimeout(() => {
      void tree.toggleNode(node)
      void handleSelectNode(node)
    }, TREE_REFRESH_DELAY_MS)
  }

  const processLocalFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const fileContent = event.target?.result as string
      const localNode: TreeNode = {
        id: `local/${file.name}`,
        name: file.name,
        path: file.name,
        type: 'file',
        source: 'local',
        loaded: true,
        content: fileContent,
      }

      tree.addLocalNode(localNode)
      void content.selectNode(localNode)
    }
    reader.readAsText(file)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => isMissionFile(file.name) || file.type === 'application/json',
    )
    if (files.length > 0) {
      processLocalFile(files[0])
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) processLocalFile(file)
    event.target.value = ''
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-label="Mission browser"
        data-testid="mission-browser"
        className="fixed bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden"
        style={{
          top: `${MODAL_TOP_INSET_PX}px`,
          left: `${MODAL_SIDE_INSET_PX}px`,
          right: `${MODAL_SIDE_INSET_PX}px`,
          bottom: `${MODAL_SIDE_INSET_PX}px`,
        }}
      >
        <MissionBrowserTopBar
          searchQuery={filters.searchQuery}
          onSearchChange={filters.setSearchQuery}
          activeTab={activeTab}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          activeFilterCount={filters.activeFilterCount}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onClose={onClose}
          isSmallScreen={isSmallScreen}
        />

        {showFilters && activeTab !== 'schedule' && (
          <MissionBrowserFilterPanel
            activeFilterCount={filters.activeFilterCount}
            onClearAllFilters={filters.clearAllFilters}
            minMatchPercent={filters.minMatchPercent}
            onMinMatchPercentChange={filters.setMinMatchPercent}
            matchSourceFilter={filters.matchSourceFilter}
            onMatchSourceFilterChange={filters.setMatchSourceFilter}
            categoryFilter={filters.categoryFilter}
            onCategoryFilterChange={filters.setCategoryFilter}
            missionClassFilter={filters.missionClassFilter}
            onMissionClassFilterChange={filters.setMissionClassFilter}
            maturityFilter={filters.maturityFilter}
            onMaturityFilterChange={filters.setMaturityFilter}
            difficultyFilter={filters.difficultyFilter}
            onDifficultyFilterChange={filters.setDifficultyFilter}
            cncfFilter={filters.cncfFilter}
            onCncfFilterChange={filters.setCncfFilter}
            selectedTags={filters.selectedTags}
            onTagToggle={(tag) => {
              filters.setSelectedTags((prev) => {
                const next = new Set(prev)
                if (next.has(tag)) next.delete(tag)
                else next.add(tag)
                return next
              })
            }}
            onClearTags={() => filters.setSelectedTags(new Set())}
            facetCounts={filters.facetCounts}
            recommendationsTotal={recommendations.recommendations.length}
            filteredRecommendationsCount={filters.filteredRecommendations.length}
          />
        )}

        <MissionBrowserTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          installerCount={recommendations.installerMissions.length}
          fixerCount={recommendations.fixerMissions.length}
        />

        <div className="flex-1 flex overflow-hidden">
          <MissionBrowserSidebar
            treeNodes={tree.treeNodes}
            expandedNodes={tree.expandedNodes}
            selectedPath={tree.selectedPath}
            revealPath={tree.revealPath}
            revealNonce={tree.revealNonce}
            onToggleNode={tree.toggleNode}
            onSelectNode={handleSelectNode}
            isDragging={isDragging}
            onDragOver={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            watchedRepos={watchedSources.watchedRepos}
            onRemoveRepo={watchedSources.handleRemoveRepo}
            onRefreshNode={handleRefreshNode}
            watchedPaths={watchedSources.watchedPaths}
            onRemovePath={watchedSources.handleRemovePath}
            addingRepo={watchedSources.addingRepo}
            setAddingRepo={watchedSources.setAddingRepo}
            newRepoValue={watchedSources.newRepoValue}
            setNewRepoValue={watchedSources.setNewRepoValue}
            onAddRepo={watchedSources.handleAddRepo}
            addingPath={watchedSources.addingPath}
            setAddingPath={watchedSources.setAddingPath}
            newPathValue={watchedSources.newPathValue}
            setNewPathValue={watchedSources.setNewPathValue}
            onAddPath={watchedSources.handleAddPath}
          />

          <MissionContentViewer
            searchPanel={{
              activeTab,
              searchQuery: filters.searchQuery,
              tokenError: recommendations.tokenError,
              missionFetchError: recommendations.missionFetchError,
              loadingRecommendations: recommendations.loadingRecommendations,
              searchProgress: recommendations.searchProgress,
              hasCluster: recommendations.hasCluster,
              recommendations: recommendations.recommendations,
              filteredRecommendations: filters.filteredRecommendations,
              installerMissions: recommendations.installerMissions,
              filteredInstallers: filters.filteredInstallers,
              loadingInstallers: recommendations.loadingInstallers,
              installerSearch: filters.installerSearch,
              onInstallerSearchChange: filters.handleInstallerSearchChange,
              installerCategoryFilter: filters.installerCategoryFilter,
              onInstallerCategoryFilterChange: filters.setInstallerCategoryFilter,
              installerMaturityFilter: filters.installerMaturityFilter,
              onInstallerMaturityFilterChange: filters.setInstallerMaturityFilter,
              fixerMissions: recommendations.fixerMissions,
              filteredFixers: filters.filteredFixers,
              loadingFixers: recommendations.loadingFixers,
              fixerSearch: filters.fixerSearch,
              onFixerSearchChange: filters.handleFixerSearchChange,
              fixerTypeFilter: filters.fixerTypeFilter,
              onFixerTypeFilterChange: filters.setFixerTypeFilter,
            }}
            filePanel={{
              selectedPath: tree.selectedPath,
              selectedNode: tree.selectedTreeNode,
              viewMode,
              onToggleNode: tree.toggleNode,
              onSelectNode: handleSelectNode,
              onClearSelectedPath: () => tree.setSelectedPath(null),
              onUseInMissionControl,
            }}
            content={content}
          />
        </div>
      </div>
    </div>
  )
}
