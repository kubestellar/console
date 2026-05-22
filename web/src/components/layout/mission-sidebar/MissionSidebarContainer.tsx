import { useCallback, useEffect } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMissions, isActiveMission, type Mission } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import type { MissionExport } from '../../../lib/missions/types'
import { cn } from '../../../lib/cn'
import { isDemoMode } from '../../../lib/demoMode'
import { isAnyModalOpen } from '../../../lib/modals'
import { FOCUS_DELAY_MS } from '../../../lib/constants/network'
import { StatusBadge } from '../../ui/StatusBadge'
import { LogoWithStar } from '../../ui/LogoWithStar'
import {
  FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS,
  MISSIONS_PAGE_SIZE,
  MISSION_IMPORT_QUERY_KEY,
  getMissionAttentionCount,
} from './missionSidebarConstants'
import {
  handleApplyResolution,
  handleImportMission,
  handleRollback,
  savedMissionToExport,
} from './missionSidebarHelpers'
import {
  useDirectImport,
  useMissionBrowserDeepLink,
  useMissionControlDeepLink,
} from './useMissionSidebarDeepLinks'
import { useMissionSidebarState } from './useMissionSidebarState'
import { useSavedMissionItems } from './useSavedMissionItems'
import { useSidebarResize } from './useSidebarResize'
import { MissionSidebarMinimized } from './MissionSidebarMinimized'
import { MissionSidebarExpanded } from './MissionSidebarExpanded'
import { MissionSidebarDialogs } from './MissionSidebarDialogs'

type MissionSidebarLocationState = {
  prefetchedMission?: MissionExport
} | null

export function MissionSidebar() {
  const { t } = useTranslation(['common'])
  const { isMobile } = useMobile()
  const { sidebarWidth, isResizing, isTablet, handleResizeStart } = useSidebarResize()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const prefetchedMission = (location.state as MissionSidebarLocationState)?.prefetchedMission
  const directImportSlug = searchParams.get(MISSION_IMPORT_QUERY_KEY)

  const {
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    setActiveMission,
    closeSidebar,
    dismissMission,
    cancelMission,
    minimizeSidebar,
    expandSidebar,
    setFullScreen,
    selectedAgent,
    startMission,
    saveMission,
    runSavedMission,
    openSidebar,
    sendMessage,
    collapsedMissions,
    toggleMissionCollapse,
    visibleMissionCount,
    setVisibleMissionCount,
    showNewMission,
    setShowNewMission,
    showBrowser,
    setShowBrowser,
    showMissionControl,
    setShowMissionControl,
    missionControlFreshSessionToken,
    setMissionControlFreshSessionToken,
    historicalMissionId,
    setHistoricalMissionId,
    pendingKubaraChart,
    setPendingKubaraChart,
    pendingReviewPlan,
    setPendingReviewPlan,
    showOrbitDialog,
    setShowOrbitDialog,
    orbitDialogPrefill,
    setOrbitDialogPrefill,
    newMissionPrompt,
    setNewMissionPrompt,
    showSavedToast,
    setShowSavedToast,
    toastCountdown,
    setToastCountdown,
    viewingMission,
    setViewingMission,
    viewingMissionRaw,
    setViewingMissionRaw,
    pendingDismissMissionId,
    setPendingDismissMissionId,
    pendingRunMissionId,
    setPendingRunMissionId,
    isDirectImporting,
    setIsDirectImporting,
    showSaveResolutionDialog,
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
    toastIntervalRef,
    browserHistoryEntryRef,
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
    runningCount,
  } = useMissionSidebarState()

  const openFreshMissionControl = useCallback(() => {
    setActiveMission(null)
    setShowHistoryPanel(false)
    setLastPanelView('dashboard')
    setShowNewMission(false)
    setNewMissionPrompt('')
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setHistoricalMissionId(undefined)
    setMissionControlFreshSessionToken((previous) => (previous ?? 0) + 1)
    setShowMissionControl(true)
    openSidebar()
  }, [
    openSidebar,
    setActiveMission,
    setHistoricalMissionId,
    setLastPanelView,
    setMissionControlFreshSessionToken,
    setNewMissionPrompt,
    setPendingKubaraChart,
    setPendingReviewPlan,
    setShowHistoryPanel,
    setShowMissionControl,
    setShowNewMission,
  ])

  const openExistingMissionControl = useCallback((missionId?: string) => {
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken(undefined)
    setHistoricalMissionId(missionId)
    setShowMissionControl(true)
  }, [setHistoricalMissionId, setMissionControlFreshSessionToken, setPendingKubaraChart, setPendingReviewPlan, setShowMissionControl])

  const { openMissionBrowser, closeMissionBrowser, deepLinkMission } = useMissionBrowserDeepLink(
    showBrowser,
    setShowBrowser,
    browserHistoryEntryRef,
    missions,
    setActiveMission,
    openSidebar,
    setFullScreen
  )

  useMissionControlDeepLink(
    searchParams,
    setSearchParams,
    openFreshMissionControl,
    setPendingKubaraChart,
    setPendingReviewPlan,
    setMissionControlFreshSessionToken,
    setShowMissionControl
  )

  const importMission = useCallback((mission: MissionExport) => {
    handleImportMission(
      mission,
      saveMission,
      openSidebar,
      setActiveMission,
      setShowSavedToast,
      setToastCountdown,
      toastIntervalRef
    )
  }, [openSidebar, saveMission, setActiveMission, setShowSavedToast, setToastCountdown, toastIntervalRef])

  useDirectImport(
    directImportSlug,
    searchParams,
    setSearchParams,
    prefetchedMission,
    setIsDirectImporting,
    importMission,
    openMissionBrowser
  )

  const applyResolution = useCallback((resolution: Parameters<typeof handleApplyResolution>[1]) => {
    handleApplyResolution(activeMission, resolution, sendMessage)
  }, [activeMission, sendMessage])

  const rollbackMission = useCallback((mission: Mission) => {
    handleRollback(mission, startMission, openSidebar)
  }, [openSidebar, startMission])

  const viewSavedMission = useCallback((mission: Mission) => {
    setViewingMission(savedMissionToExport(mission))
    setViewingMissionRaw(false)
  }, [setViewingMission, setViewingMissionRaw])

  const runMission = useCallback((missionId: string) => {
    if (isDemoMode()) {
      window.dispatchEvent(new CustomEvent('open-install'))
      return
    }

    const mission = (missions || []).find((candidate) => candidate.id === missionId)
    const isInstallMission = mission?.importedFrom?.missionClass === 'install' || mission?.type === 'deploy'
    if (isInstallMission) {
      setPendingRunMissionId(missionId)
      return
    }

    runSavedMission(missionId)
  }, [missions, runSavedMission, setPendingRunMissionId])

  const startNewMission = useCallback(() => {
    if (!newMissionPrompt.trim()) {
      return
    }

    startMission({
      type: 'custom',
      title: newMissionPrompt,
      description: newMissionPrompt,
      initialPrompt: newMissionPrompt,
      skipReview: true,
    })
    setNewMissionPrompt('')
    setShowNewMission(false)
  }, [newMissionPrompt, setNewMissionPrompt, setShowNewMission, startMission])

  const openNewMissionComposer = useCallback((panelView: 'dashboard' | 'history') => {
    setLastPanelView(panelView)
    setShowNewMission(true)
    setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
  }, [newMissionInputRef, setLastPanelView, setShowNewMission])

  const getRunningMissionStatusLabel = useCallback((status: Mission['status']) => {
    switch (status) {
      case 'pending':
        return t('missionSidebar.statusLabels.pending', { defaultValue: 'Starting…' })
      case 'cancelling':
        return t('missionSidebar.statusLabels.cancelling', { defaultValue: 'Cancelling…' })
      case 'running':
      default:
        return t('missionSidebar.statusLabels.running', { defaultValue: 'Running' })
    }
  }, [t])

  const sidebarSavedMissionItems = useSavedMissionItems(
    savedMissions,
    viewSavedMission,
    runMission,
    setPendingDismissMissionId
  )

  const pendingMission = pendingRunMissionId
    ? missions.find((mission) => mission.id === pendingRunMissionId) ?? null
    : null

  useEffect(() => {
    const root = document.documentElement
    const isOverlayMode = isMobile || isTablet

    if (!isOverlayMode && isSidebarOpen && !isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', `${sidebarWidth}px`)
    } else if (!isOverlayMode && isSidebarOpen && isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', '48px')
    } else {
      root.style.setProperty('--mission-sidebar-width', '0px')
    }

    return () => {
      root.style.removeProperty('--mission-sidebar-width')
    }
  }, [isFullScreen, isMobile, isSidebarMinimized, isSidebarOpen, isTablet, sidebarWidth])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || showBrowser || showMissionControl) {
        return
      }
      if (isAnyModalOpen()) {
        return
      }
      if (isFullScreen) {
        setFullScreen(false)
      } else if (isSidebarOpen) {
        closeSidebar()
      }
    }

    if (!isSidebarOpen) {
      return undefined
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [closeSidebar, isFullScreen, isSidebarOpen, setFullScreen, showBrowser, showMissionControl])

  if (isSidebarOpen && isSidebarMinimized && !isMobile) {
    return (
      <MissionSidebarMinimized
        onExpand={expandSidebar}
        activeMissionsCount={activeMissions.length}
        runningCount={runningCount}
        needsAttention={needsAttention}
      />
    )
  }

  return (
    <>
      {isSidebarOpen && !isSidebarMinimized && (
        <MissionSidebarExpanded
          activeMission={activeMission}
          dashboardProps={{
            showNewMission,
            listTotalMissions,
            onOpenMissionBrowser: openMissionBrowser,
            onOpenMissionControl: openFreshMissionControl,
            onStartNewMission: () => openNewMissionComposer('dashboard'),
            onToggleHistory: toggleHistoryPanel,
          }}
          emptyStateProps={{
            showNewMission,
            onOpenMissionBrowser: openMissionBrowser,
            onOpenMissionControl: openFreshMissionControl,
            onStartNewMission: () => openNewMissionComposer('dashboard'),
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
            onOpenMissionBrowser: openMissionBrowser,
            onOpenMissionControl: openFreshMissionControl,
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
            onRollback: rollbackMission,
            onOpenMissionControl: openExistingMissionControl,
            onOpenOrbitDialog: () => setShowOrbitDialog(true),
            onRunSavedMission: runSavedMission,
            isFullScreen,
            savedMissionItems: sidebarSavedMissionItems,
          }}
          missionSearchQuery={missionSearchQuery}
          newMissionProps={{
            isMobile,
            newMissionPrompt,
            newMissionInputRef,
            onPromptChange: setNewMissionPrompt,
            onStartMission: startNewMission,
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
            onApplyResolution: applyResolution,
            onSaveNewResolution: () => setShowSaveResolutionDialog(true),
            onViewMission: viewSavedMission,
            onRunMission: runMission,
            onRemoveMission: setPendingDismissMissionId,
            panelWidthClass: FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS,
          }}
          resizeHandleProps={{
            onResizeStart: handleResizeStart,
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
                getRunningMissionStatusLabel,
              }
            : null}
          selectedAgent={selectedAgent}
          showHistoryPanel={showHistoryPanel}
          showNewMission={showNewMission}
          showSavedToast={showSavedToast}
          sidebarWidth={sidebarWidth}
          toastCountdown={toastCountdown}
        />
      )}

      <MissionSidebarDialogs
        browserProps={{
          isOpen: showBrowser,
          onClose: closeMissionBrowser,
          onImport: importMission,
          initialMission: deepLinkMission || undefined,
          onUseInMissionControl: (chartName: string) => {
            closeMissionBrowser()
            setPendingKubaraChart(chartName)
            setPendingReviewPlan(undefined)
            setMissionControlFreshSessionToken(undefined)
            setShowMissionControl(true)
          },
        }}
        clusterSelectionProps={pendingRunMissionId
          ? {
              open: true,
              missionTitle: pendingMission?.title ?? 'Mission',
              onSelect: (clusters) => {
                runSavedMission(pendingRunMissionId, clusters.length > 0 ? clusters.join(',') : undefined)
                setPendingRunMissionId(null)
              },
              onCancel: () => setPendingRunMissionId(null),
            }
          : null}
        confirmDialogProps={{
          isOpen: pendingDismissMissionId !== null,
          onClose: () => setPendingDismissMissionId(null),
          onConfirm: () => {
            if (pendingDismissMissionId) {
              dismissMission(pendingDismissMissionId)
            }
            setPendingDismissMissionId(null)
          },
          title: t('layout.missionSidebar.deleteMission'),
          message: t('layout.missionSidebar.deleteMissionConfirm'),
          confirmLabel: t('common.delete'),
          variant: 'danger',
        }}
        missionControlProps={{
          open: showMissionControl,
          onClose: () => {
            setShowMissionControl(false)
            setPendingKubaraChart(undefined)
            setPendingReviewPlan(undefined)
            setMissionControlFreshSessionToken(undefined)
            setHistoricalMissionId(undefined)
          },
          initialKubaraChart: pendingKubaraChart,
          reviewPlanEncoded: pendingReviewPlan,
          freshSessionToken: missionControlFreshSessionToken,
          historicalMissionId,
        }}
        orbitDialogProps={showOrbitDialog
          ? {
              onClose: () => {
                setShowOrbitDialog(false)
                setOrbitDialogPrefill(undefined)
              },
              prefill: orbitDialogPrefill,
            }
          : null}
        saveResolutionProps={activeMission && showSaveResolutionDialog
          ? {
              mission: activeMission,
              isOpen: showSaveResolutionDialog,
              onClose: () => setShowSaveResolutionDialog(false),
              onSaved: () => setResolutionPanelView('history'),
            }
          : null}
        savedMissionDetailProps={viewingMission
          ? {
              isMobile,
              savedMissions,
              viewingMission,
              viewingMissionRaw,
              onClose: () => setViewingMission(null),
              onRunMission: runMission,
              onToggleRaw: () => setViewingMissionRaw((previous) => !previous),
            }
          : null}
      />
    </>
  )
}

export function MissionSidebarToggle() {
  const { t } = useTranslation(['common'])
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const needsAttention = getMissionAttentionCount(missions)
  const runningCount = missions.filter((mission) => mission.status === 'running').length
  const activeCount = missions.filter(isActiveMission).length

  if (isSidebarOpen) {
    return null
  }

  return (
    <button
      type="button"
      onClick={openSidebar}
      data-tour="ai-missions-toggle"
      data-testid="mission-sidebar-toggle"
      className={cn(
        'fixed z-sticky flex items-center gap-2 rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:bg-secondary',
        isMobile
          ? 'bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] max-w-[calc(100vw-2rem)] px-3 py-2'
          : 'bottom-4 right-4 px-4 py-3',
        needsAttention > 0 && 'ring-2 ring-purple-500/30'
      )}
      title={t('missionSidebar.openAIMissions')}
    >
      <LogoWithStar className={cn(isMobile ? 'w-4 h-4' : 'w-5 h-5', needsAttention > 0 && 'text-purple-400')} />
      {runningCount > 0 && (
        <Loader2 className={isMobile ? 'w-3 h-3 animate-spin text-purple-400' : 'w-4 h-4 animate-spin text-purple-400'} />
      )}
      <span className={cn(isMobile ? 'max-w-[8rem] truncate text-xs' : 'text-sm', needsAttention > 0 && 'font-medium')}>
        {activeCount > 0 ? t('missionSidebar.missionCount', { count: activeCount }) : t('missionSidebar.aiMissions')}
      </span>
      {needsAttention > 0 && (
        <StatusBadge color="purple" size={isMobile ? 'xs' : 'sm'} variant="solid" rounded="full">
          {needsAttention}
        </StatusBadge>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && '-rotate-90', needsAttention > 0 && 'text-purple-400')} />
    </button>
  )
}
