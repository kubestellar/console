import { Check, Download, Maximize2, Pencil, StopCircle, Trash2, X, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../../hooks/useMissions'
import { cn } from '../../../../lib/cn'
import { AgentBadge } from '../../../agent/AgentIcon'
import { STATUS_CONFIG, TYPE_ICONS } from '../types'
import { MISSION_HEADER_DESCRIPTION_PREVIEW_LENGTH, MISSION_HEADER_TITLE_PREVIEW_LENGTH } from './missionChatConstants'
import { getMissionAgentProvider, truncateMissionTextAtWordBoundary } from './missionChatUtils'

interface MissionChatHeaderProps {
  config: typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]
  editTitleValue: string
  isEditingTitle: boolean
  isFullScreen: boolean
  maxTitleLength: number
  mission: Mission
  relatedResolutionCount: number
  showHeaderStatus: boolean
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onCancelEditTitle: () => void
  onCancelMission: () => void
  onDeleteMission: () => void
  onEditTitleChange: (value: string) => void
  onSaveTitle: () => void
  onSaveTranscript: () => void
  onStartEditingTitle: () => void
  onTitleKeyDown: (event: React.KeyboardEvent) => void
  onToggleFullScreen?: () => void
}

export function MissionChatHeader({
  config,
  editTitleValue,
  isEditingTitle,
  isFullScreen,
  maxTitleLength,
  mission,
  relatedResolutionCount,
  showHeaderStatus,
  titleInputRef,
  onCancelEditTitle,
  onCancelMission,
  onDeleteMission,
  onEditTitleChange,
  onSaveTitle,
  onSaveTranscript,
  onStartEditingTitle,
  onTitleKeyDown,
  onToggleFullScreen,
}: MissionChatHeaderProps) {
  const { t } = useTranslation('common')
  const StatusIcon = config.icon
  const TypeIcon = TYPE_ICONS[mission.type] || TYPE_ICONS.custom
  const missionAgentProvider = getMissionAgentProvider(mission.agent)
  const truncatedTitle = truncateMissionTextAtWordBoundary(mission.title, MISSION_HEADER_TITLE_PREVIEW_LENGTH)
  const truncatedDescription = truncateMissionTextAtWordBoundary(mission.description, MISSION_HEADER_DESCRIPTION_PREVIEW_LENGTH)

  return (
    <>
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <TypeIcon className="w-5 h-5 text-primary" />
          {isEditingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={editTitleValue}
                onChange={(event) => onEditTitleChange(event.target.value.slice(0, maxTitleLength))}
                onKeyDown={onTitleKeyDown}
                onBlur={onSaveTitle}
                maxLength={maxTitleLength}
                className="flex-1 min-w-0 px-2 py-0.5 text-sm font-semibold bg-secondary/50 border border-border rounded text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                data-testid="mission-title-input"
              />
              <button
                onClick={onSaveTitle}
                onMouseDown={(event) => event.preventDefault()}
                className="p-0.5 hover:bg-green-500/20 rounded transition-colors"
                title={t('common.save', { defaultValue: 'Save' })}
              >
                <Check className="w-3.5 h-3.5 text-green-400" />
              </button>
              <button
                onClick={onCancelEditTitle}
                onMouseDown={(event) => event.preventDefault()}
                className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
                title={t('common.cancel', { defaultValue: 'Cancel' })}
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-1 flex-1 min-w-0 group">
              <h3
                className="font-semibold text-foreground flex-1 min-w-0 leading-tight break-words"
                title={truncatedTitle.isTruncated ? mission.title : undefined}
              >
                {truncatedTitle.text}
              </h3>
              <button
                onClick={onStartEditingTitle}
                className="p-0.5 rounded transition-colors text-muted-foreground hover:bg-secondary shrink-0"
                title={t('missionChat.renameTitle', { defaultValue: 'Rename mission' })}
                data-testid="mission-title-edit-btn"
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
          <button
            onClick={onSaveTranscript}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title={t('layout.missionSidebar.saveTranscript')}
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDeleteMission}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
            title={t('layout.missionSidebar.deleteMission')}
          >
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
          </button>
          {onToggleFullScreen && !isFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="p-1 hover:bg-secondary rounded transition-colors"
              title={t('layout.missionSidebar.expandToFullScreen')}
            >
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {(mission.status === 'running' || mission.status === 'pending' || mission.status === 'blocked') && (
            <button
              onClick={onCancelMission}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg transition-colors"
              title={t('missionChat.terminateSession', { defaultValue: 'Terminate Session' })}
              data-testid="terminate-session-btn"
            >
              <StopCircle className="w-3.5 h-3.5" />
              {mission.status === 'pending'
                ? t('missionChat.cancelPending', { defaultValue: 'Cancel' })
                : t('missionChat.terminateSession', { defaultValue: 'Terminate Session' })}
            </button>
          )}
          {showHeaderStatus && (
            <div
              className={cn('flex items-center gap-1', config.color)}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Mission status: ${config.label}`}
            >
              <StatusIcon
                className={cn('w-4 h-4', (mission.status === 'running' || mission.status === 'cancelling') && 'animate-spin')}
                aria-hidden="true"
              />
              <span className="text-xs">{config.label}</span>
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 flex-wrap min-w-0">
          <p
            className="text-xs text-muted-foreground flex-1 min-w-0 break-words leading-relaxed"
            title={truncatedDescription.isTruncated ? mission.description : undefined}
          >
            {truncatedDescription.text}
          </p>
          {mission.agent && missionAgentProvider && (
            <AgentBadge provider={missionAgentProvider} name={mission.agent} />
          )}
        </div>
        {mission.cluster && (
          <span className="text-xs text-purple-400 mt-1 inline-block">
            {t('missionChat.clusterLabel', { cluster: mission.cluster })}
          </span>
        )}
      </div>

      {!isFullScreen && relatedResolutionCount > 0 && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-purple-300">
                {t('missionChat.similarResolutionsFound', { count: relatedResolutionCount })}
              </span>
            </div>
            {onToggleFullScreen && (
              <button
                onClick={onToggleFullScreen}
                className="text-2xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                {t('missionChat.viewInFullscreen')}
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
