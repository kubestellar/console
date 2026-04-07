import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Maximize2,
  Trash2,
  StopCircle,
  Loader2,
  Satellite,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { ConfirmDialog } from '../../../lib/modals'
import { STATUS_CONFIG, TYPE_ICONS } from './types'

export function MissionListItem({ mission, isActive, onClick, onDismiss, onExpand, onTerminate, isCollapsed, onToggleCollapse }: {
  mission: Mission
  isActive: boolean
  onClick: () => void
  onDismiss: () => void
  onExpand: () => void
  onTerminate?: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  const { t } = useTranslation()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const config = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type] || TYPE_ICONS.custom

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
        <div className={cn('flex-shrink-0', config.color)}>
          <StatusIcon className={cn('w-4 h-4', mission.status === 'running' && 'animate-spin')} />
        </div>
        <button
          onClick={onClick}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <TypeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{mission.title}</span>
        </button>
        {mission.status === 'cancelling' && (
          <span className="p-0.5 flex-shrink-0" title={t('layout.missionSidebar.cancelling')}>
            <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
          </span>
        )}
        {mission.status === 'running' && onTerminate && (
          <button
            onClick={(e) => { e.stopPropagation(); onTerminate() }}
            className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
            title={t('layout.missionSidebar.terminateSession')}
            data-testid="terminate-session-list-btn"
          >
            <StopCircle className="w-3.5 h-3.5 text-red-400 hover:text-red-300" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors flex-shrink-0"
          title={t('layout.missionSidebar.expandToFullScreen')}
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
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
          <div className="flex items-center gap-2 mt-1">
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
