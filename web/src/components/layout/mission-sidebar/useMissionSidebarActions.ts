import { useCallback, useEffect } from 'react'
import type { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import { isDemoMode } from '../../../lib/demoMode'
import { isAnyModalOpen } from '../../../lib/modals'
import { FOCUS_DELAY_MS } from '../../../lib/constants/network'
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
import type { useMissionSidebarState } from './useMissionSidebarState'
import { useSavedMissionItems } from './useSavedMissionItems'

const MINIMIZED_SIDEBAR_WIDTH = '48px'
const HIDDEN_SIDEBAR_WIDTH = '0px'
const SIDEBAR_WIDTH_CSS_VAR = '--mission-sidebar-width'

export type MissionSidebarState = ReturnType<typeof useMissionSidebarState>

type SetSearchParams = ReturnType<typeof useSearchParams>[1]

export interface UseMissionSidebarActionsParams {
  state: MissionSidebarState
  searchParams: URLSearchParams
  setSearchParams: SetSearchParams
  prefetchedMission: MissionExport | undefined
  directImportSlug: string | null
  isMobile: boolean
  isTablet: boolean
  sidebarWidth: number
}

/**
 * All callbacks, deep-link wiring and layout side effects for the mission
 * sidebar. Extracted from `MissionSidebarContainer` so the container itself
 * stays a thin composition shell.
 */
export function useMissionSidebarActions({
  state,
  searchParams,
  setSearchParams,
  prefetchedMission,
  directImportSlug,
  isMobile,
  isTablet,
  sidebarWidth,
}: UseMissionSidebarActionsParams) {
  const { t } = useTranslation(['common'])

  const {
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    setActiveMission,
    closeSidebar,
    setFullScreen,
    startMission,
    saveMission,
    runSavedMission,
    openSidebar,
    sendMessage,
    showBrowser,
    setShowBrowser,
    showMissionControl,
    setShowMissionControl,
    setMissionControlFreshSessionToken,
    setHistoricalMissionId,
    setPendingKubaraChart,
    setPendingReviewPlan,
    newMissionPrompt,
    setNewMissionPrompt,
    setShowSavedToast,
    setToastCountdown,
    setViewingMission,
    setViewingMissionRaw,
    setPendingDismissMissionId,
    setPendingRunMissionId,
    setIsDirectImporting,
    setShowNewMission,
    setShowHistoryPanel,
    setLastPanelView,
    newMissionInputRef,
    toastIntervalRef,
    browserHistoryEntryRef,
    savedMissions,
  } = state

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
    setActiveMission(null)
    setShowNewMission(false)
    setNewMissionPrompt('')
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken(undefined)
    setHistoricalMissionId(missionId)
    setShowMissionControl(true)
    openSidebar()
  }, [openSidebar, setActiveMission, setHistoricalMissionId, setMissionControlFreshSessionToken, setNewMissionPrompt, setPendingKubaraChart, setPendingReviewPlan, setShowMissionControl, setShowNewMission])

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

  const savedMissionItems = useSavedMissionItems(
    savedMissions,
    viewSavedMission,
    runMission,
    setPendingDismissMissionId
  )

  useEffect(() => {
    const root = document.documentElement
    const isOverlayMode = isMobile || isTablet

    if (!isOverlayMode && isSidebarOpen && !isSidebarMinimized && !isFullScreen) {
      root.style.setProperty(SIDEBAR_WIDTH_CSS_VAR, `${sidebarWidth}px`)
    } else if (!isOverlayMode && isSidebarOpen && isSidebarMinimized && !isFullScreen) {
      root.style.setProperty(SIDEBAR_WIDTH_CSS_VAR, MINIMIZED_SIDEBAR_WIDTH)
    } else {
      root.style.setProperty(SIDEBAR_WIDTH_CSS_VAR, HIDDEN_SIDEBAR_WIDTH)
    }

    return () => {
      root.style.removeProperty(SIDEBAR_WIDTH_CSS_VAR)
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

  return {
    applyResolution,
    closeMissionBrowser,
    deepLinkMission,
    getRunningMissionStatusLabel,
    importMission,
    openExistingMissionControl,
    openFreshMissionControl,
    openMissionBrowser,
    openNewMissionComposer,
    rollbackMission,
    runMission,
    savedMissionItems,
    startNewMission,
    viewSavedMission,
  }
}

export type MissionSidebarActions = ReturnType<typeof useMissionSidebarActions>
