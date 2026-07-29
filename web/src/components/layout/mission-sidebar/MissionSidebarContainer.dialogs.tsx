import { ChevronRight, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMissions, isActiveMission } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { getMissionAttentionCount } from './missionSidebarConstants'
import { MissionSidebarDialogs } from './MissionSidebarDialogs'
import type { MissionSidebarActions, MissionSidebarState } from './useMissionSidebarActions'

interface MissionSidebarDialogHostProps {
  state: MissionSidebarState
  actions: MissionSidebarActions
  isMobile: boolean
}

/**
 * Renders every dialog/overlay owned by the mission sidebar.
 */
export function MissionSidebarDialogHost({ state, actions, isMobile }: MissionSidebarDialogHostProps) {
  const { t } = useTranslation(['common'])

  const {
    missions,
    activeMission,
    dismissMission,
    runSavedMission,
    showBrowser,
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
    viewingMission,
    setViewingMission,
    viewingMissionRaw,
    setViewingMissionRaw,
    pendingDismissMissionId,
    setPendingDismissMissionId,
    pendingRunMissionId,
    setPendingRunMissionId,
    showSaveResolutionDialog,
    setShowSaveResolutionDialog,
    setResolutionPanelView,
    savedMissions,
  } = state

  const pendingMission = pendingRunMissionId
    ? missions.find((mission) => mission.id === pendingRunMissionId) ?? null
    : null

  return (
    <MissionSidebarDialogs
      browserProps={{
        isOpen: showBrowser,
        onClose: actions.closeMissionBrowser,
        onImport: actions.importMission,
        initialMission: actions.deepLinkMission || undefined,
        onUseInMissionControl: (chartName: string) => {
          actions.closeMissionBrowser()
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
            onRunMission: actions.runMission,
            onToggleRaw: () => setViewingMissionRaw((previous) => !previous),
          }
        : null}
    />
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
