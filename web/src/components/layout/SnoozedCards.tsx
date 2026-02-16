import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, X, ArrowRight, Bell, Lightbulb, Zap, AlertTriangle, Shield, Server, Scale, Activity } from 'lucide-react'
import { useSnoozedCards, formatTimeRemaining, SnoozedSwap } from '../../hooks/useSnoozedCards'
import { useSnoozedRecommendations, formatElapsedTime, SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import { useSnoozedMissions, SnoozedMission, formatTimeRemaining as formatMissionTimeRemaining } from '../../hooks/useSnoozedMissions'
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

interface SnoozedCardsProps {
  onApplySwap?: (swap: SnoozedSwap) => void
  onApplyRecommendation?: (rec: SnoozedRecommendation) => void
  onApplyMission?: (mission: SnoozedMission) => void
}

export function SnoozedCards({ onApplySwap, onApplyRecommendation, onApplyMission }: SnoozedCardsProps) {
  const { t } = useTranslation()
  const { snoozedSwaps, unsnoozeSwap, dismissSwap } = useSnoozedCards()
  const { snoozedRecommendations, unsnooozeRecommendation, dismissSnoozedRecommendation } = useSnoozedRecommendations()
  const { snoozedMissions, unsnoozeMission, dismissMission } = useSnoozedMissions()
  const [, forceUpdate] = useState(0)

  // Update every minute to refresh time display
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const hasSwaps = snoozedSwaps.length > 0
  const hasRecs = snoozedRecommendations.length > 0
  const hasMissions = snoozedMissions.length > 0

  // Show placeholder when nothing is snoozed
  if (!hasSwaps && !hasRecs && !hasMissions) {
    return (
      <div className="mt-4">
        <div className="flex items-center gap-2 px-3 mb-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('sidebar.snoozedItems')}
          </h4>
        </div>
        <div className="mx-2 p-3 rounded-lg border border-dashed border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            {t('sidebar.noSnoozedItems')}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('sidebar.snoozedItemsHint')}
          </p>
        </div>
      </div>
    )
  }

  const handleApplySwap = (swap: SnoozedSwap) => {
    unsnoozeSwap(swap.id)
    onApplySwap?.(swap)
  }

  const handleApplyRecommendation = (rec: SnoozedRecommendation) => {
    unsnooozeRecommendation(rec.id)
    onApplyRecommendation?.(rec)
  }

  const handleApplyMission = (mission: SnoozedMission) => {
    unsnoozeMission(mission.id)
    onApplyMission?.(mission)
  }

  const handleDismissMission = (missionId: string, suggestionId: string) => {
    unsnoozeMission(missionId)
    dismissMission(suggestionId)
  }

  return (
    <>
    {/* Snoozed Missions (Suggested Actions) */}
    {hasMissions && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Lightbulb className="w-4 h-4 text-purple-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedActions')}
        </h4>
        <span className="ml-auto text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
          {snoozedMissions.length}
        </span>
      </div>
      <div className="space-y-2">
        {snoozedMissions.map((mission) => (
          <SnoozedMissionItem
            key={mission.id}
            mission={mission}
            onApply={() => handleApplyMission(mission)}
            onDismiss={() => handleDismissMission(mission.id, mission.suggestion.id)}
          />
        ))}
      </div>
    </div>
    )}

    {/* Snoozed Recommendations */}
    {hasRecs && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Lightbulb className="w-4 h-4 text-yellow-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedRecommendations')}
        </h4>
        <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
          {snoozedRecommendations.length}
        </span>
      </div>
      <div className="space-y-2">
        {snoozedRecommendations.map((rec) => (
          <SnoozedRecommendationItem
            key={rec.id}
            rec={rec}
            onApply={() => handleApplyRecommendation(rec)}
            onDismiss={() => dismissSnoozedRecommendation(rec.id)}
          />
        ))}
      </div>
    </div>
    )}

    {/* Snoozed Card Swaps */}
    {hasSwaps && (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-3 mb-2">
        <Clock className="w-4 h-4 text-purple-400" />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('sidebar.snoozedSwaps')}
        </h4>
        <span className="ml-auto text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
          {snoozedSwaps.length}
        </span>
      </div>
      <div className="space-y-2">
        {snoozedSwaps.map((swap) => (
          <SnoozedItem
            key={swap.id}
            swap={swap}
            onApply={() => handleApplySwap(swap)}
            onDismiss={() => dismissSwap(swap.id)}
          />
        ))}
      </div>
    </div>
    )}
    </>
  )
}

interface SnoozedItemProps {
  swap: SnoozedSwap
  onApply: () => void
  onDismiss: () => void
}

function SnoozedItem({ swap, onApply, onDismiss }: SnoozedItemProps) {
  const { t } = useTranslation()
  const [isHovered, setIsHovered] = useState(false)
  const timeRemaining = formatTimeRemaining(swap.snoozedUntil)
  const isExpired = timeRemaining === 'Expired'

  return (
    <div
      className={cn(
        'relative p-2 mx-2 rounded-lg text-xs transition-all duration-200',
        isExpired
          ? 'bg-yellow-500/10 border border-yellow-500/30'
          : 'bg-secondary/30 hover:bg-secondary/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-1 right-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Card swap info */}
      <div className="flex items-center gap-1 pr-4 mb-1">
        <span className="text-muted-foreground truncate">{swap.originalCardTitle}</span>
        <ArrowRight className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-foreground truncate">{swap.newCardTitle}</span>
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
              {t('sidebar.readyToSwap')}
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
            className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            {t('actions.apply')}
          </button>
        )}
      </div>

      {/* Reason tooltip on hover */}
      {isHovered && swap.reason && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <p className="text-muted-foreground line-clamp-2">{swap.reason}</p>
        </div>
      )}
    </div>
  )
}

interface SnoozedRecommendationItemProps {
  rec: SnoozedRecommendation
  onApply: () => void
  onDismiss: () => void
}

function SnoozedRecommendationItem({ rec, onApply, onDismiss }: SnoozedRecommendationItemProps) {
  const { t } = useTranslation()
  const [isHovered, setIsHovered] = useState(false)
  const elapsedTime = formatElapsedTime(rec.snoozedAt)

  const priorityColor = {
    high: 'border-red-500/30 bg-red-500/10',
    medium: 'border-yellow-500/30 bg-yellow-500/10',
    low: 'border-blue-500/30 bg-blue-500/10',
  }[rec.recommendation.priority]

  const priorityTextColor = {
    high: 'text-red-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
  }[rec.recommendation.priority]

  return (
    <div
      className={cn(
        'relative p-2 mx-2 rounded-lg text-xs transition-all duration-200 border',
        priorityColor,
        'hover:brightness-110'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-1 right-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Recommendation info */}
      <div className="flex items-center gap-2 pr-4 mb-1">
        <Lightbulb className={cn('w-3 h-3 flex-shrink-0', priorityTextColor)} />
        <span className="text-foreground truncate font-medium">{rec.recommendation.title}</span>
      </div>

      {/* Elapsed time and actions */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          {elapsedTime}
        </span>

        {isHovered && (
          <button
            onClick={onApply}
            className={cn(
              'px-2 py-0.5 rounded transition-colors',
              rec.recommendation.priority === 'high'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : rec.recommendation.priority === 'medium'
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            )}
          >
            {t('actions.restore')}
          </button>
        )}
      </div>

      {/* Reason tooltip on hover */}
      {isHovered && rec.recommendation.reason && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <p className="text-muted-foreground line-clamp-2">{rec.recommendation.reason}</p>
        </div>
      )}
    </div>
  )
}

interface SnoozedMissionItemProps {
  mission: SnoozedMission
  onApply: () => void
  onDismiss: () => void
}

function SnoozedMissionItem({ mission, onApply, onDismiss }: SnoozedMissionItemProps) {
  const { t } = useTranslation()
  const [isHovered, setIsHovered] = useState(false)
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
        <Icon className={cn('w-3 h-3 flex-shrink-0', priorityTextColor)} />
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
