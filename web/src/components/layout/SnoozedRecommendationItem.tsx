import { useTranslation } from 'react-i18next'
import { Clock, X, Lightbulb } from 'lucide-react'
import { formatElapsedTime, SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import { useHoverState } from '../../hooks/useHoverState'
import { cn } from '../../lib/cn'

interface SnoozedRecommendationItemProps {
  rec: SnoozedRecommendation
  onApply: () => void
  onDismiss: () => void
}

export function SnoozedRecommendationItem({ rec, onApply, onDismiss }: SnoozedRecommendationItemProps) {
  const { t } = useTranslation()
  const { isHovered, hoverProps } = useHoverState()
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
      {...hoverProps}
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
        <Lightbulb className={cn('w-3 h-3 shrink-0', priorityTextColor)} />
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
