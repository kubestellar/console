import { useTranslation } from 'react-i18next'
import {
  FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS,
  MISSIONS_PAGE_SIZE,
} from './missionSidebarConstants'
import { MissionSidebarExpanded } from './MissionSidebarExpanded'
import type { MissionSidebarActions, MissionSidebarState } from './useMissionSidebarActions'

interface MissionSidebarSurfaceProps {
  state: MissionSidebarState
  actions: MissionSidebarActions
  isMobile: boolean
  isTablet: boolean
  isResizing: boolean
  sidebarWidth: number
  onResizeStart: (event: React.MouseEvent) => void
}

/**
 * Renders the expanded sidebar surface. Pure prop plumbing between the
 * sidebar state/actions and `MissionSidebarExpanded`.
 */
export function MissionSidebarSurface({
  state,
  actions,
  isMobile,
  isTablet,
  isResizing,
  sidebarWidth,
  onResizeStart,
}: MissionSidebarSurfaceProps) {
  const { t } = useTranslation(['common'])

  const {
    missions,
    activeMission,
    isFullScreen,
    setActiveMission,
    closeSidebar,
    dismissMission,
    cancelMission,
    minimizeSidebar,
    setFullScreen,
    selectedAgent,
    runSavedMission,
    collapsedMissions,
    toggleMissionCollapse,
    visibleMissionCount,
    setVisibleMissionCount,
    showNewMission,
    setShowNewMission,
    setShowOrbitDialog,
    setOrbitDialogPrefill,
    newMissionPrompt,
    setNewMissionPrompt,
    showSavedToast,
    setShowSavedToast,
    toastCountdown,
    setToastCountdown,
    setPendingDismissMissionId,
    isDirectImporting,
    setShowSaveResolutionDialog,
    resolutionPanelView,
    setResolutionPanelView,
    missionSearchQuery,
    setMissionSearchQuery,
    showHistoryPanel,
    setShowHistoryPanel,
    toggleHistoryPanel,
    lastPanelView,
    setLastPanelView,
    newMissionInputRef,
    allResolutions,
    relatedResolutions,
    savedMissions,
    missionControlRuns,
    activeMissions,
    visibleActiveMissions,
    hasMoreMissions,
    listTotalMissions,
    needsAttention,
    runningMissions,
    runningMissionPreview,
  } = state

  return (
    <MissionSidebarExpanded
      activeMission={activeMission}
      dashboardProps={{
        showNewMission,
        listTotalMissions,
        onOpenMissionBrowser: actions.openMissionBrowser,
        onOpenMissionControl: actions.openFreshMissionControl,
        onStartNewMission: () => actions.openNewMissionComposer('dashboard'),
        onToggleHistory: toggleHistoryPanel,
      }}
      emptyStateProps={{
        showNewMission,
        onOpenMissionBrowser: actions.openMissionBrowser,
        onOpenMissionControl: actions.openFreshMissionControl,
        onStartNewMission: () => actions.openNewMissionComposer('dashboard'),
      }}
      headerProps={{
        isMobile,
        isFullScreen,
        needsAttention,
        showHistoryPanel,
        listTotalMissions,
        activeMission,
        newMissionInputRef,
        onClose: closeSidebar,
        onMinimize: minimizeSidebar,
        onToggleFullScreen: () => setFullScreen(!isFullScreen),
        onOpenMissionBrowser: actions.openMissionBrowser,
        onOpenMissionControl: actions.openFreshMissionControl,
        onSetShowNewMission: setShowNewMission,
        onToggleHistory: toggleHistoryPanel,
        onSetActiveMission: setActiveMission,
        onSetShowHistoryPanel: setShowHistoryPanel,
      }}
      isDirectImporting={isDirectImporting}
      isFullScreen={isFullScreen}
      isMobile={isMobile}
      isResizing={isResizing}
      isTablet={isTablet}
      listTotalMissions={listTotalMissions}
      missionChatKey={activeMission?.id}
      missionChatProps={{
        mission: activeMission!,
        isFullScreen,
        onToggleFullScreen: () => setFullScreen(true),
        onOpenOrbitDialog: (prefill) => {
          setOrbitDialogPrefill(prefill)
          setShowOrbitDialog(true)
        },
      }}
      missionListProps={{
        missions,
        savedMissions,
        missionControlRuns,
        activeMissions,
        visibleActiveMissions,
        hasMoreMissions,
        visibleMissionCount,
        onLoadMore: () => setVisibleMissionCount((previous) => previous + MISSIONS_PAGE_SIZE),
        missionSearchQuery,
        onSearchChange: setMissionSearchQuery,
        collapsedMissions,
        onToggleCollapse: toggleMissionCollapse,
        onSelectMission: (missionId) => {
          setLastPanelView('history')
          setActiveMission(missionId)
        },
        onDismissMission: dismissMission,
        onCancelMission: cancelMission,
        onExpandMission: (missionId) => {
          setLastPanelView('history')
          setActiveMission(missionId)
          setFullScreen(true)
        },
        onRollback: actions.rollbackMission,
        onOpenMissionControl: actions.openExistingMissionControl,
        onOpenOrbitDialog: () => setShowOrbitDialog(true),
        onRunSavedMission: runSavedMission,
        isFullScreen,
        savedMissionItems: actions.savedMissionItems,
      }}
      missionSearchQuery={missionSearchQuery}
      newMissionProps={{
        isMobile,
        newMissionPrompt,
        newMissionInputRef,
        onPromptChange: setNewMissionPrompt,
        onStartMission: actions.startNewMission,
        onCancel: () => {
          setShowNewMission(false)
          setNewMissionPrompt('')
        },
      }}
      onBackToMissions={() => {
        setActiveMission(null)
        if (lastPanelView === 'history') {
          setShowHistoryPanel(true)
        }
      }}
      onCloseSavedToast={() => {
        setShowSavedToast(null)
        setToastCountdown(0)
      }}
      resolutionProps={{
        savedMissions,
        relatedResolutions,
        allResolutionsCount: allResolutions.length,
        resolutionPanelView,
        onSetResolutionPanelView: setResolutionPanelView,
        onApplyResolution: actions.applyResolution,
        onSaveNewResolution: () => setShowSaveResolutionDialog(true),
        onViewMission: actions.viewSavedMission,
        onRunMission: actions.runMission,
        onRemoveMission: setPendingDismissMissionId,
        panelWidthClass: FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS,
      }}
      resizeHandleProps={{
        onResizeStart,
        label: t('missionSidebar.resizeHandleTooltip'),
      }}
      runningBannerProps={runningMissions.length > 0 && !activeMission && !showHistoryPanel
        ? {
            runningMissions,
            runningMissionPreview,
            onSelectMission: (missionId) => {
              setLastPanelView('history')
              setActiveMission(missionId)
            },
            onViewRunningMissions: () => {
              setLastPanelView('history')
              setShowHistoryPanel(true)
            },
            getRunningMissionStatusLabel: actions.getRunningMissionStatusLabel,
          }
        : null}
      selectedAgent={selectedAgent}
      showHistoryPanel={showHistoryPanel}
      showNewMission={showNewMission}
      showSavedToast={showSavedToast}
      sidebarWidth={sidebarWidth}
      toastCountdown={toastCountdown}
    />
  )
}
