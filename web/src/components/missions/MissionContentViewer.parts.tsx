import { getMissionShareUrl } from './browser'
import { MissionDetailView } from './MissionDetailView'
import { ImproveMissionDialog } from './ImproveMissionDialog'
import { UnstructuredFilePreview } from './UnstructuredFilePreview'
import { MissionBrowserRecommendedTab } from './MissionBrowserRecommendedTab'
import { MissionBrowserInstallersTab } from './MissionBrowserInstallersTab'
import { MissionBrowserFixesTab } from './MissionBrowserFixesTab'
import { MissionBrowserScheduleActionTab } from './MissionBrowserScheduleActionTab'
import { useMissionContentContext } from './MissionContentContext'

export function MissionFilePanel() {
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

export function MissionSearchPanel() {
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
