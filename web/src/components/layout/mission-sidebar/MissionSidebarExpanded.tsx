import { CheckCircle2, ChevronLeft, Loader2, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isDemoMode } from '../../../lib/demoMode'
import { cn } from '../../../lib/cn'
import type { Mission } from '../../../hooks/useMissions'
import { MissionChat } from './MissionChat'
import { MissionListPanel } from './MissionListPanel'
import { MissionResolution } from './MissionResolution'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { MissionSidebarDashboard } from './MissionSidebarDashboard'
import { MissionSidebarEmptyState } from './MissionSidebarEmptyState'
import { MissionSidebarHeader } from './MissionSidebarHeader'
import { MissionSidebarNewMission } from './MissionSidebarNewMission'
import { MissionSidebarRunningBanner } from './MissionSidebarRunningBanner'

interface MissionSidebarExpandedProps {
  activeMission: Mission | null
  dashboardProps: Parameters<typeof MissionSidebarDashboard>[0]
  emptyStateProps: Parameters<typeof MissionSidebarEmptyState>[0]
  headerProps: Parameters<typeof MissionSidebarHeader>[0]
  isDirectImporting: boolean
  isFullScreen: boolean
  isMobile: boolean
  isResizing: boolean
  isTablet: boolean
  listTotalMissions: number
  missionChatKey?: string
  missionChatProps: Parameters<typeof MissionChat>[0]
  missionListProps: Parameters<typeof MissionListPanel>[0]
  missionSearchQuery: string
  newMissionProps: Parameters<typeof MissionSidebarNewMission>[0]
  onBackToMissions: () => void
  onCloseSavedToast: () => void
  resolutionProps: Parameters<typeof MissionResolution>[0]
  resizeHandleProps: Parameters<typeof SidebarResizeHandle>[0]
  runningBannerProps: Parameters<typeof MissionSidebarRunningBanner>[0] | null
  selectedAgent: string | null
  showHistoryPanel: boolean
  showNewMission: boolean
  showSavedToast: string | null
  sidebarWidth: number
  toastCountdown: number
}

export function MissionSidebarExpanded({
  activeMission,
  dashboardProps,
  emptyStateProps,
  headerProps,
  isDirectImporting,
  isFullScreen,
  isMobile,
  isResizing,
  isTablet,
  listTotalMissions,
  missionChatKey,
  missionChatProps,
  missionListProps,
  missionSearchQuery,
  newMissionProps,
  onBackToMissions,
  onCloseSavedToast,
  resolutionProps,
  resizeHandleProps,
  runningBannerProps,
  selectedAgent,
  showHistoryPanel,
  showNewMission,
  showSavedToast,
  sidebarWidth,
  toastCountdown,
}: MissionSidebarExpandedProps) {
  const { t } = useTranslation(['common'])

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          onClick={headerProps.onClose}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      {!isMobile && isTablet && !isFullScreen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-overlay lg:hidden"
          onClick={headerProps.onClose}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <div
        data-tour="ai-missions"
        data-testid="mission-sidebar"
        className={cn(
          'fixed bg-card border-border flex min-h-0 flex-col overflow-hidden shadow-2xl',
          isMobile ? 'z-modal' : 'z-sidebar',
          !isResizing && 'transition-[width,top,border,transform] duration-300 ease-in-out',
          isMobile && 'inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh] max-h-[80dvh] translate-y-0',
          !isMobile && isFullScreen && 'inset-0 top-16 border-l-0 rounded-none',
          !isMobile && !isFullScreen && 'top-16 right-0 bottom-0 border-l shadow-xl'
        )}
        style={!isMobile && !isFullScreen ? { width: sidebarWidth } : undefined}
      >
        {!isMobile && !isFullScreen && (
          <SidebarResizeHandle {...resizeHandleProps} />
        )}

        {isMobile && (
          <div className="flex justify-center py-2 md:hidden">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}

        <MissionSidebarHeader {...headerProps} />

        {showNewMission && <MissionSidebarNewMission {...newMissionProps} />}

        {selectedAgent === 'none' && (
          <div className="mx-3 mt-2 p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-cyan-400 shrink-0" />
            <p className="text-xs text-cyan-400">{t('agent.aiPausedBanner')}</p>
          </div>
        )}

        {showSavedToast && (
          <div className="mx-3 mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm font-medium text-green-400">{t('layout.missionSidebar.missionImported')}</p>
              {toastCountdown > 0 && (
                <span className="text-2xs text-green-400/70 ml-auto">{toastCountdown}s</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mb-2">{showSavedToast}</p>
            {toastCountdown > 0 && (
              <p className="text-2xs text-muted-foreground/70 mb-2">
                {isDemoMode()
                  ? t('layout.missionSidebar.useButtonToStart')
                  : t('layout.missionSidebar.missionReady')}
              </p>
            )}
            <button
              type="button"
              onClick={onCloseSavedToast}
              className="text-2xs text-green-400/70 hover:text-green-400"
            >
              {t('common.dismiss', 'Dismiss')}
            </button>
          </div>
        )}

        {isDirectImporting && (
          <div className="mx-3 mt-2 p-2.5 bg-secondary/30 border border-border rounded-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">{t('missionSidebar.importingMission', 'Importing mission...')}</p>
          </div>
        )}

        {runningBannerProps && <MissionSidebarRunningBanner {...runningBannerProps} />}

        {listTotalMissions === 0 && !missionSearchQuery.trim() && !activeMission && !showHistoryPanel ? (
          <MissionSidebarEmptyState {...emptyStateProps} />
        ) : activeMission ? (
          <div className={cn('flex-1 flex min-h-0 min-w-0 overflow-hidden', isFullScreen && 'w-full')}>
            {isFullScreen && <MissionResolution {...resolutionProps} />}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <button
                onClick={onBackToMissions}
                className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border shrink-0"
              >
                <ChevronLeft className="w-3 h-3" />
                {t('missionSidebar.backToMissions', { count: listTotalMissions })}
              </button>
              <MissionChat key={missionChatKey} {...missionChatProps} />
            </div>
          </div>
        ) : !showHistoryPanel ? (
          <MissionSidebarDashboard {...dashboardProps} />
        ) : (
          <MissionListPanel {...missionListProps} />
        )}
      </div>
    </>
  )
}
