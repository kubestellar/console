import { useTranslation } from 'react-i18next'
import { Clock, X, Bell, Zap, AlertTriangle, Shield, Server, Scale, Activity } from 'lucide-react'
import { SnoozedMission, formatTimeRemaining as formatMissionTimeRemaining } from '../../hooks/useSnoozedMissions'
import { useHoverState } from '../../hooks/useHoverState'
import { MissionType } from '../../hooks/useMissionSuggestions'
import { cn } from '../../lib/cn'

const MISSION_ICONS: Record<MissionType, typeof Zap> = {
  scale: Scale,
  limits: Activity,
  restart: Zap,
  unavailable: AlertTriangle,
  security: Shield,
  health: Server,
  resource: Activity,
}

interface SnoozedMissionItemProps {
  mission: SnoozedMission
  onApply: () => void
  onDismiss: () => void
}

export function SnoozedMissionItem({ mission, onApply, onDismiss }: SnoozedMissionItemProps) {
  const { t } = useTranslation()
  const { isHovered, hoverProps } = useHoverState()
  const timeRemaining = formatMissionTimeRemaining(mission.expiresAt - Date.now())
  const isExpired = mission.expiresAt <= Date.now()

  const priorityColor = {
    critical: 'border-red-500/30 bg-red-500/10',
    high: 'border-orange-500/30 bg-orange-500/10',
    medium: 'border-yellow-500/30 bg-yellow-500/10',
    low: 'border-blue-500/30 bg-blue-500/10',
  }[mission.suggestion.priority]

  const priorityTextColor = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
  }[mission.suggestion.priority]

  const Icon = MISSION_ICONS[mission.suggestion.type] || Zap

  return (
    <div
      className={cn(
        'relative p-2 mx-2 rounded-lg text-xs transition-all duration-200 border',
        isExpired ? 'border-yellow-500/30 bg-yellow-500/10' : priorityColor,
        'hover:brightness-110'
      )}
      {...hoverProps}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-1 right-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Mission info */}
      <div className="flex items-center gap-2 pr-4 mb-1">
        <Icon className={cn('w-3 h-3 shrink-0', priorityTextColor)} />
        <span className="text-foreground truncate font-medium">{mission.suggestion.title}</span>
      </div>

      {/* Time remaining and actions */}
      <div className="flex items-center justify-between">
        <span className={cn(
          'flex items-center gap-1',
          isExpired ? 'text-yellow-400' : 'text-muted-foreground'
        )}>
          {isExpired ? (
            <>
              <Bell className="w-3 h-3 animate-pulse" />
              {t('sidebar.ready')}
            </>
          ) : (
            <>
              <Clock className="w-3 h-3" />
              {timeRemaining}
            </>
          )}
        </span>

        {(isHovered || isExpired) && (
          <button
            onClick={onApply}
            className={cn(
              'px-2 py-0.5 rounded transition-colors',
              'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            )}
          >
            {t('actions.restore')}
          </button>
        )}
      </div>

      {/* Description on hover */}
      {isHovered && mission.suggestion.description && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <p className="text-muted-foreground line-clamp-2">{mission.suggestion.description}</p>
        </div>
      )}
    </div>
  )
}
