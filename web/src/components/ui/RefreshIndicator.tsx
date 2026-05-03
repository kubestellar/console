import { memo, useState, useEffect, useRef } from 'react'
import { RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'
import { formatLastSeen } from '../../lib/errorClassifier'
import { Button } from './Button'

// Minimum duration to show spin animation (ensures at least one full rotation)
// Must match animation duration (1s) defined in index.css for animate-spin-min
const MIN_SPIN_DURATION = 1000


interface RefreshIndicatorProps {
  isRefreshing: boolean
  lastUpdated?: Date | null
  className?: string
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
  staleThresholdMinutes?: number
}

/**
 * Visual indicator for refresh state with last updated time
 *
 * States:
 * - Idle: Shows clock icon with "Updated Xs ago"
 * - Refreshing: Shows spinning refresh icon with "Updating" label
 * - Stale: Shows amber clock icon with warning styling
 *
 * Wrapped in memo — all props are primitives / Date, so shallow compare is
 * safe and avoids re-rendering this leaf on every parent re-render tick.
 */
export const RefreshIndicator = memo(function RefreshIndicator({
  isRefreshing,
  lastUpdated,
  className,
  size = 'sm',
  showLabel = true,
  staleThresholdMinutes = 5,
}: RefreshIndicatorProps) {
  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing])

  const isStale = lastUpdated &&
    (Date.now() - lastUpdated.getTime()) > staleThresholdMinutes * MS_PER_MINUTE

  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-2xs' : 'text-xs'

  const tooltip = lastUpdated
    ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
    : 'Not yet updated'

  if (isVisuallySpinning) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-blue-400',
          textSize,
          className
        )}
        title="Updating..."
        role="status"
        aria-live="polite"
        aria-label="Updating data"
      >
        <RefreshCw className={cn(iconSize, 'animate-spin-min')} aria-hidden="true" />
        {showLabel && <span>Updating</span>}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5',
        isStale ? 'text-yellow-400' : 'text-muted-foreground',
        textSize,
        className
      )}
      title={tooltip}
      role="status"
      aria-label={lastUpdated ? `Last updated: ${formatLastSeen(lastUpdated)}` : 'Not yet updated'}
    >
      <Clock className={iconSize} aria-hidden="true" />
      {showLabel && (
        <span>
          {lastUpdated ? formatLastSeen(lastUpdated) : 'pending'}
        </span>
      )}
    </span>
  )
})

// Button variant for manual refresh with failure state
interface RefreshButtonProps {
  isRefreshing: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: Date | number | null
  onRefresh?: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

function formatLastRefreshTime(value: Date | number | null | undefined): string {
  if (!value) return 'Never refreshed'

  const timestamp = value instanceof Date ? value.getTime() : value
  const now = Date.now()
  const diff = now - timestamp

  if (diff < MS_PER_MINUTE) {
    return 'Just now'
  } else if (diff < MS_PER_HOUR) {
    const minutes = Math.floor(diff / MS_PER_MINUTE)
    return `${minutes}m ago`
  } else if (diff < MS_PER_DAY) {
    const hours = Math.floor(diff / MS_PER_HOUR)
    return `${hours}h ago`
  } else {
    const days = Math.floor(diff / MS_PER_DAY)
    return `${days}d ago`
  }
}

export function RefreshButton({
  isRefreshing,
  isFailed = false,
  consecutiveFailures = 0,
  lastRefresh,
  onRefresh,
  disabled = false,
  size = 'md',
  className = '',
}: RefreshButtonProps) {
  const { t } = useTranslation('common')
  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isRefreshing) {
      // Start spinning
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      // Refresh ended - ensure minimum spin duration
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing])

  const sizeClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const buttonPadding = size === 'sm' ? 'p-0.5' : 'p-1'

  const tooltipText = isFailed
    ? `Failed to refresh (${consecutiveFailures} failures). Last success: ${formatLastRefreshTime(lastRefresh)}`
    : `Last refresh: ${formatLastRefreshTime(lastRefresh)}`

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {isFailed && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-xs"
          title={`${consecutiveFailures} consecutive refresh failures`}
        >
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          <span>{t('refresh.failed')}</span>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={disabled || isRefreshing || isVisuallySpinning}
        className={buttonPadding}
        title={tooltipText}
        aria-label={tooltipText}
        icon={
          <RefreshCw
            className={`${sizeClasses} ${
              isVisuallySpinning
                ? 'text-blue-400 animate-spin-min'
                : isFailed
                ? 'text-red-400'
                : 'text-muted-foreground'
            }`}
          />
        }
      />
    </div>
  )
}

// Simple spinning indicator without button (for inline use).
// Wrapped in memo — all props are primitives so shallow compare is safe.
export const RefreshSpinner = memo(function RefreshSpinner({
  isRefreshing,
  size = 'md',
  className = '',
}: {
  isRefreshing: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing])

  if (!isVisuallySpinning) return null

  const sizeClasses = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <RefreshCw className={`${sizeClasses} text-blue-400 animate-spin-min ${className}`} />
  )
})
