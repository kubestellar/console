import { useEffect, useMemo, useRef, useState } from 'react'
import { useMissions } from '../../../hooks/useMissions'
import { useResolutions, detectIssueSignature } from '../../../hooks/useResolutions'
import type { MissionExport, OrbitResourceFilter } from '../../../lib/missions/types'
import {
  BACKGROUND_EXECUTION_STATUSES,
  BACKGROUND_MISSION_PREVIEW_LIMIT,
  getMissionAttentionCount,
  HISTORY_PANEL_KEY,
  MISSIONS_PAGE_SIZE,
  matchesMissionSearch,
} from './missionSidebarConstants'

export function useMissionSidebarState() {
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
  } = useMissions()

  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [visibleMissionCount, setVisibleMissionCount] = useState(MISSIONS_PAGE_SIZE)
  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  const [missionControlFreshSessionToken, setMissionControlFreshSessionToken] = useState<number | undefined>(undefined)
  const [historicalMissionId, setHistoricalMissionId] = useState<string | undefined>(undefined)
  const [pendingKubaraChart, setPendingKubaraChart] = useState<string | undefined>(undefined)
  const [pendingReviewPlan, setPendingReviewPlan] = useState<string | undefined>(undefined)
  const [showOrbitDialog, setShowOrbitDialog] = useState(false)
  const [orbitDialogPrefill, setOrbitDialogPrefill] = useState<{
    clusters?: string[]
    resourceFilters?: Record<string, OrbitResourceFilter[]>
  } | undefined>(undefined)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null)
  const [toastCountdown, setToastCountdown] = useState(0)
  const [viewingMission, setViewingMission] = useState<MissionExport | null>(null)
  const [viewingMissionRaw, setViewingMissionRaw] = useState(false)
  const [pendingDismissMissionId, setPendingDismissMissionId] = useState<string | null>(null)
  const [pendingRunMissionId, setPendingRunMissionId] = useState<string | null>(null)
  const [isDirectImporting, setIsDirectImporting] = useState(false)
  const [showSaveResolutionDialog, setShowSaveResolutionDialog] = useState(false)
  const [resolutionPanelView, setResolutionPanelView] = useState<'related' | 'history'>('related')
  const [missionSearchQuery, setMissionSearchQuery] = useState('')
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_PANEL_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [lastPanelView, setLastPanelView] = useState<'dashboard' | 'history'>(
    showHistoryPanel ? 'history' : 'dashboard'
  )

  const newMissionInputRef = useRef<HTMLTextAreaElement>(null!)
  const toastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const browserHistoryEntryRef = useRef(false)

  const { findSimilarResolutions, allResolutions } = useResolutions()

  useEffect(() => {
    setShowSaveResolutionDialog(false)
  }, [activeMission?.id])

  useEffect(() => {
    return () => {
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
        toastIntervalRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setVisibleMissionCount(MISSIONS_PAGE_SIZE)
  }, [missionSearchQuery])

  const toggleHistoryPanel = () => {
    setShowHistoryPanel((previous) => {
      const next = !previous
      try {
        localStorage.setItem(HISTORY_PANEL_KEY, String(next))
      } catch {
        // ignore storage errors
      }
      if (!next) {
        setMissionSearchQuery('')
      }
      return next
    })
  }

  const toggleMissionCollapse = (missionId: string) => {
    setCollapsedMissions((previous) => {
      const next = new Set(previous)
      if (next.has(missionId)) {
        next.delete(missionId)
      } else {
        next.add(missionId)
      }
      return next
    })
  }

  const normalizedMissionSearchQuery = missionSearchQuery.trim().toLowerCase()
  const savedMissions = useMemo(
    () => (missions || []).filter((mission) => mission.status === 'saved' && matchesMissionSearch(mission, normalizedMissionSearchQuery)),
    [missions, normalizedMissionSearchQuery]
  )
  const activeMissions = useMemo(
    () => (missions || [])
      .filter((mission) => mission.status !== 'saved' && matchesMissionSearch(mission, normalizedMissionSearchQuery))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [missions, normalizedMissionSearchQuery]
  )

  const visibleActiveMissions = activeMissions.slice(0, visibleMissionCount)
  const hasMoreMissions = activeMissions.length > visibleMissionCount
  const listTotalMissions = savedMissions.length + activeMissions.length
  const needsAttention = getMissionAttentionCount(missions)

  const runningMissions = missions
    .filter((mission) => BACKGROUND_EXECUTION_STATUSES.has(mission.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const runningMissionPreview = runningMissions.slice(0, BACKGROUND_MISSION_PREVIEW_LIMIT)
  const runningCount = missions.filter((mission) => mission.status === 'running').length

  const relatedResolutions = useMemo(() => {
    if (!activeMission) {
      return []
    }

    const content = [
      activeMission.title,
      activeMission.description,
      ...(activeMission.messages || []).slice(0, 3).map((message) => message.content),
    ].join('\n')
    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') {
      return []
    }

    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  }, [activeMission, findSimilarResolutions])

  useEffect(() => {
    if (needsAttention > 0 && !showHistoryPanel && !activeMission) {
      setShowHistoryPanel(true)
    }
  }, [activeMission, needsAttention, showHistoryPanel])

  return {
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
    activeMissions,
    visibleActiveMissions,
    hasMoreMissions,
    listTotalMissions,
    needsAttention,
    runningMissions,
    runningMissionPreview,
    runningCount,
  }
}
