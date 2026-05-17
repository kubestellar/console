import { memo, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Maximize2,
  Trash2,
  StopCircle,
  Loader2,
  Satellite,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { ConfirmDialog } from '../../../lib/modals'
import { STATUS_CONFIG, TYPE_ICONS } from './types'

/** Mission statuses that indicate the mission was interrupted or failed and may need rollback */
const ROLLBACK_ELIGIBLE_STATUSES = new Set(['failed', 'cancelled'])
const MISSION_PROGRESS_MIN = 0
const MISSION_PROGRESS_MAX = 100
const MISSION_STATUS_LABEL_KEYS: Record<Mission['status'], string> = {
  pending: 'missionSidebar.statusLabels.pending',
  running: 'missionSidebar.statusLabels.running',
  cancelling: 'missionSidebar.statusLabels.cancelling',
  cancelled: 'missionSidebar.statusLabels.cancelled',
  waiting_input: 'missionSidebar.statusLabels.waitingInput',
  completed: 'missionSidebar.statusLabels.completed',
  failed: 'missionSidebar.statusLabels.failed',
  blocked: 'missionSidebar.statusLabels.blocked',
  saved: 'missionSidebar.statusLabels.saved',
}

type MissionListItemProps = {
  mission: Mission
  isActive: boolean
  onClick: () => void
  onDismiss: () => void
  onExpand: () => void
  onTerminate?: () => void
  /** Start a rollback mission to reverse changes made by this failed/cancelled mission */
  onRollback?: (mission: Mission) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function MissionListItemComponent({ mission, isActive, onClick, onDismiss, onExpand, onTerminate, onRollback, isCollapsed, onToggleCollapse }: MissionListItemProps) {
  const { t } = useTranslation()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false)
  const config = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type] || TYPE_ICONS.custom
  const statusLabel = t(MISSION_STATUS_LABEL_KEYS[mission.status], { defaultValue: config.label })
  const progressValue = typeof mission.progress === 'number'
    ? Math.max(MISSION_PROGRESS_MIN, Math.min(MISSION_PROGRESS_MAX, Math.round(mission.progress)))
    : null

  /** Whether this mission is eligible for rollback (failed or cancelled with a non-trivial history) */
  const canRollback = onRollback &&
    ROLLBACK_ELIGIBLE_STATUSES.has(mission.status) &&
    (mission.messages || []).length > 0

  return (
    <>
    <ConfirmDialog
      isOpen={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      onConfirm={() => {
        setShowDeleteConfirm(false)
        onDismiss()
      }}
      title={t('layout.missionSidebar.deleteMission')}
      message={t('layout.missionSidebar.deleteMissionConfirm')}
      confirmLabel={t('common.delete')}
      variant="danger"
    />
    <ConfirmDialog
      isOpen={showRollbackConfirm}
      onClose={() => setShowRollbackConfirm(false)}
      onConfirm={() => {
        setShowRollbackConfirm(false)
        onRollback?.(mission)
      }}
      title={t('layout.missionSidebar.rollbackMission')}
      message={t('layout.missionSidebar.rollbackMissionConfirm')}
      confirmLabel="Rollback"
      variant="warning"
    />
    <div
      className={cn(
        'w-full text-left rounded-lg transition-colors',
        isActive
          ? 'bg-primary/20 border border-primary/50'
          : 'hover:bg-secondary/50 border border-transparent'
      )}
    >
      {/* Header row with controls */}
      <div className="flex items-center gap-2 p-3 pb-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
          title={isCollapsed ? t('common.expand') : t('common.collapse')}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <div className={cn('shrink-0', config.color)}>
          <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
        </div>
        <button
          onClick={onClick}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <TypeIcon className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{mission.title}</span>
        </button>
        {mission.status === 'cancelling' && (
          <span className="p-0.5 shrink-0" title={t('layout.missionSidebar.cancelling')}>
            <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
          </span>
        )}
        {(mission.status === 'running' || mission.status === 'pending' || mission.status === 'blocked') && onTerminate && (
          <button
            onClick={(e) => { e.stopPropagation(); onTerminate() }}
            className="p-0.5 hover:bg-red-500/20 rounded transition-colors shrink-0"
            title={t('layout.missionSidebar.terminateSession')}
            data-testid="terminate-session-list-btn"
          >
            <StopCircle className="w-3.5 h-3.5 text-red-400 hover:text-red-300" />
          </button>
        )}
        {/* Rollback button for failed/cancelled missions (#6313) */}
        {canRollback && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowRollbackConfirm(true) }}
            className="p-0.5 hover:bg-orange-500/20 rounded transition-colors shrink-0"
            title={t('layout.missionSidebar.rollbackMission')}
            data-testid="rollback-mission-btn"
          >
            <Undo2 className="w-3.5 h-3.5 text-orange-400 hover:text-orange-300" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors shrink-0"
          title={t('layout.missionSidebar.expandToFullScreen')}
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors shrink-0"
          title={t('layout.missionSidebar.deleteMission')}
        >
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <button
          onClick={onClick}
          className="w-full text-left px-3 pb-3 pt-1 pl-10"
        >
          <p className="text-xs text-muted-foreground truncate">{mission.description}</p>
          <div className="mt-2 rounded-md border border-border/60 bg-secondary/30 p-2">
            <div className="flex items-center justify-between gap-2 text-2xs">
              <span className="text-muted-foreground">{t('common.status')}</span>
              <span className={cn('font-medium', config.color)}>{statusLabel}</span>
            </div>
            {mission.currentStep && (
              <p className="mt-1 text-xs text-foreground line-clamp-2">
                <span className="text-muted-foreground">{t('missionSidebar.currentStepLabel', { defaultValue: 'Current step:' })}</span>{' '}
                {mission.currentStep}
              </p>
            )}
            {progressValue !== null && (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2 text-2xs">
                  <span className="text-muted-foreground">{t('missionSidebar.progressLabel', { defaultValue: 'Progress' })}</span>
                  <span className="text-foreground">{t('missionSidebar.progressValue', { progress: progressValue, defaultValue: '{{progress}}%' })}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-background/60">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {mission.importedFrom?.missionClass === 'orbit' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full border border-purple-500/20">
                <Satellite className="w-2.5 h-2.5" />
                {t('orbit.title')}
              </span>
            )}
            {mission.cluster && (
              <span className="text-xs text-purple-400">@{mission.cluster}</span>
            )}
            <span className="text-2xs text-muted-foreground/70">
              {mission.updatedAt.toLocaleDateString()} {mission.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </button>
      )}
    </div>
    </>
  )
}

function areMissionListItemPropsEqual(prev: MissionListItemProps, next: MissionListItemProps): boolean {
  if (prev.isActive !== next.isActive || prev.isCollapsed !== next.isCollapsed) return false
  if (Boolean(prev.onTerminate) !== Boolean(next.onTerminate)) return false
  if (Boolean(prev.onRollback) !== Boolean(next.onRollback)) return false

  const prevMission = prev.mission
  const nextMission = next.mission
  const prevUpdatedAt = prevMission.updatedAt instanceof Date ? prevMission.updatedAt.getTime() : new Date(prevMission.updatedAt).getTime()
  const nextUpdatedAt = nextMission.updatedAt instanceof Date ? nextMission.updatedAt.getTime() : new Date(nextMission.updatedAt).getTime()

  return prevMission.id === nextMission.id &&
    prevMission.status === nextMission.status &&
    prevMission.type === nextMission.type &&
    prevMission.title === nextMission.title &&
    prevMission.description === nextMission.description &&
    prevMission.cluster === nextMission.cluster &&
    prevUpdatedAt === nextUpdatedAt &&
    prevMission.importedFrom?.missionClass === nextMission.importedFrom?.missionClass &&
    (prevMission.messages || []).length === (nextMission.messages || []).length
}

export const MissionListItem = memo(MissionListItemComponent, areMissionListItemPropsEqual)
