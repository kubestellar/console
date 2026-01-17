import { RefreshCw, Clock } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatLastSeen } from '../../lib/errorClassifier'

interface RefreshIndicatorProps {
  isRefreshing: boolean
  lastUpdated?: Date | null
  className?: string
  size?: 'sm' | 'md'
  showLabel?: boolean
  staleThresholdMinutes?: number
}

/**
 * Visual indicator for refresh state with last updated time
 *
 * States:
 * - Idle: Shows clock icon with "Updated Xs ago"
 * - Refreshing: Shows spinning refresh icon
 * - Stale: Shows amber clock icon with warning styling
 */
export function RefreshIndicator({
  isRefreshing,
  lastUpdated,
  className,
  size = 'sm',
  showLabel = true,
  staleThresholdMinutes = 5,
}: RefreshIndicatorProps) {
  const isStale = lastUpdated &&
    (Date.now() - lastUpdated.getTime()) > staleThresholdMinutes * 60 * 1000

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  const tooltip = lastUpdated
    ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
    : 'Not yet updated'

  if (isRefreshing) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-muted-foreground',
          textSize,
          className
        )}
        title="Refreshing..."
      >
        <RefreshCw className={cn(iconSize, 'animate-spin')} />
        {showLabel && <span>Refreshing</span>}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        isStale ? 'text-amber-400' : 'text-muted-foreground',
        textSize,
        className
      )}
      title={tooltip}
    >
      <Clock className={iconSize} />
      {showLabel && (
        <span>
          {lastUpdated ? formatLastSeen(lastUpdated) : 'pending'}
        </span>
      )}
    </span>
  )
}
