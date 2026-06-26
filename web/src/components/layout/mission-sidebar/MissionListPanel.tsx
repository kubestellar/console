import { Search, Satellite, Bookmark, X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { MissionListItem } from './MissionListItem'
import { OrbitReminderBanner } from '../../missions/OrbitReminderBanner'
import { MissionTypeExplainer } from '../../missions/MissionTypeExplainer'
import {
  getMissionControlRunSummary,
  getMissionControlStatusClass,
  MISSION_CONTROL_STATUS_LABEL_KEYS,
} from '../../mission-control/missionControlHistory'
import type { Mission } from '../../../hooks/useMissions'
import { useTranslation } from 'react-i18next'

interface MissionListPanelProps {
  missions: Mission[]
  savedMissions: Mission[]
  missionControlRuns: Mission[]
  activeMissions: Mission[]
  visibleActiveMissions: Mission[]
  hasMoreMissions: boolean
  visibleMissionCount: number
  onLoadMore: () => void
  missionSearchQuery: string
  onSearchChange: (q: string) => void
  collapsedMissions: Set<string>
  onToggleCollapse: (id: string) => void
  onSelectMission: (id: string) => void
  onDismissMission: (id: string) => void
  onCancelMission: (id: string) => void
  onExpandMission: (id: string) => void
  onRollback: (mission: Mission) => void
  onOpenMissionControl: (id: string) => void
  onOpenOrbitDialog: () => void
  onRunSavedMission: (id: string) => void
  isFullScreen: boolean
  savedMissionItems: React.ReactNode
}

/**
 * Scrollable mission history/library list shown when the history panel is
 * visible and no mission is active.
 */
export function MissionListPanel({
  missions,
  savedMissions,
  missionControlRuns,
  activeMissions,
  visibleActiveMissions,
  hasMoreMissions,
  visibleMissionCount,
  onLoadMore,
  missionSearchQuery,
  onSearchChange,
  collapsedMissions,
  onToggleCollapse,
  onSelectMission,
  onDismissMission,
  onCancelMission,
  onExpandMission,
  onRollback,
  onOpenMissionControl,
  onOpenOrbitDialog,
  onRunSavedMission,
  isFullScreen,
  savedMissionItems,
}: MissionListPanelProps) {
  const { t } = useTranslation(['common'])

  return (
    <div className={cn(
      "flex-1 overflow-y-auto scroll-enhanced p-2 space-y-2",
      isFullScreen && "max-w-3xl mx-auto w-full"
    )}>
      {/* Mission search filter (#3944) */}
      {missions.length > 1 && (
        <div className="relative px-1 pb-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={missionSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('missionSidebar.searchMissions', { defaultValue: 'Search missions...' })}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/50"
          />
          {missionSearchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-secondary rounded transition-colors"
              title={t('common.clear', { defaultValue: 'Clear' })}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Mission type explainer — demo mode only */}
      <MissionTypeExplainer />

      {/* Add Orbit button — always visible above saved missions */}
      <div className="mb-2 px-2">
        <button
          onClick={onOpenOrbitDialog}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/10 transition-colors w-full justify-center"
          title={t('orbit.addOrbit')}
        >
          <Satellite className="w-3.5 h-3.5" />
          {t('orbit.addOrbit')}
        </button>
      </div>

      {/* Saved missions section */}
      {savedMissions.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <Bookmark className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.savedMissions')}</span>
            <StatusBadge color="purple" size="xs" rounded="full">{savedMissions.length}</StatusBadge>
          </div>
          <div className="space-y-1.5">
            {savedMissionItems}
          </div>
        </div>
      )}

      {/* Orbit reminder banner — shows when orbit missions are due/overdue */}
      <OrbitReminderBanner
        missions={missions}
        onRunMission={(missionId) => {
          onSelectMission(missionId)
          onRunSavedMission(missionId)
        }}
      />

      {missionControlRuns.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-xs font-semibold text-foreground">
              {t('missionControl.summary.historyTitle', { defaultValue: 'Mission Control history' })}
            </span>
            <StatusBadge color="cyan" size="xs" rounded="full">{missionControlRuns.length}</StatusBadge>
          </div>
          {(missionControlRuns || []).map((mission) => {
            const { clusters, workloads, guidance, progress } = getMissionControlRunSummary(mission)
            const statusLabel = t(MISSION_CONTROL_STATUS_LABEL_KEYS[mission.status], { defaultValue: mission.status })
            const runFootprint = t('missionControl.summary.runFootprint', {
              defaultValue: '{{workloads}} workloads · {{clusters}} clusters',
              workloads,
              clusters,
            })
            const nextDirections = guidance || t('missionControl.summary.defaultGuidance', {
              defaultValue: 'Reopen this Mission Control session to review the deployed tools and recommended next steps.',
            })

            return (
              <button
                key={mission.id}
                type="button"
                onClick={() => onOpenMissionControl(mission.id)}
                className="w-full rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-left transition-colors hover:bg-cyan-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{mission.title}</p>
                    <p className={cn('mt-1 text-xs font-medium', getMissionControlStatusClass(mission.status))}>{statusLabel}</p>
                  </div>
                  <span className="shrink-0 text-2xs text-muted-foreground/70">
                    {mission.updatedAt.toLocaleDateString()} {mission.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {(workloads > 0 || clusters > 0) && (
                  <p className="mt-2 text-xs text-muted-foreground">{runFootprint}</p>
                )}
                {progress !== null && (
                  <p className="mt-2 text-xs text-foreground">
                    {t('missionControl.summary.progressLine', {
                      defaultValue: 'Progress: {{progress}}%',
                      progress,
                    })}
                  </p>
                )}
                <p className="mt-2 text-xs text-foreground line-clamp-2">
                  <span className="font-medium text-muted-foreground">
                    {t('missionControl.summary.nextDirections', { defaultValue: 'Next directions' })}:
                  </span>{' '}
                  {nextDirections}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* Active missions section — paginated for performance (#4778) */}
      {activeMissions.length > 0 && (
        <>
          {(savedMissions.length > 0 || missionControlRuns.length > 0) && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-xs font-semibold text-foreground">{t('layout.missionSidebar.activeMissions')}</span>
              <span className="text-2xs bg-secondary px-1.5 py-0.5 rounded-full">{activeMissions.length}</span>
            </div>
          )}
          {visibleActiveMissions.map((mission) => (
            <MissionListItem
              key={mission.id}
              mission={mission}
              isActive={false}
              onClick={() => {
                onSelectMission(mission.id)
                if (mission.title === 'Mission Control Planning' || mission.context?.missionControl) {
                  onOpenMissionControl(mission.id)
                }
              }}
              onDismiss={() => onDismissMission(mission.id)}
              onTerminate={() => onCancelMission(mission.id)}
              onRollback={onRollback}
              onExpand={() => {
                onExpandMission(mission.id)
                if (mission.title === 'Mission Control Planning' || mission.context?.missionControl) {
                  onOpenMissionControl(mission.id)
                }
              }}
              isCollapsed={collapsedMissions.has(mission.id)}
              onToggleCollapse={() => onToggleCollapse(mission.id)}
            />
          ))}
          {/* Load More button — renders remaining missions incrementally */}
          {hasMoreMissions && (
            <button
              onClick={onLoadMore}
              className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              {t('missionSidebar.loadMore', {
                defaultValue: 'Load more ({{remaining}} remaining)',
                remaining: activeMissions.length - visibleMissionCount })}
            </button>
          )}
        </>
      )}

      {/* Empty state when only saved missions, no active */}
      {activeMissions.length === 0 && missionControlRuns.length === 0 && savedMissions.length > 0 && !missionSearchQuery && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">{t('layout.missionSidebar.noActiveMissionsHint')}</p>
        </div>
      )}
      {/* No search results */}
      {missionSearchQuery && savedMissions.length === 0 && missionControlRuns.length === 0 && activeMissions.length === 0 && (
        <div className="text-center py-6">
          <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{t('missionSidebar.noSearchResults', { defaultValue: 'No missions match your search.' })}</p>
        </div>
      )}
    </div>
  )
}
