import { cn } from '../../lib/cn'

const DEFAULT_PROGRESS_COLOR = '#9333ea'
const THRESHOLD_CRITICAL_COLOR = '#ef4444'
const THRESHOLD_WARNING_COLOR = '#eab308'
const THRESHOLD_OK_COLOR = '#22c55e'

function resolveThresholdColor(
  percentage: number,
  color: string | undefined,
  thresholds: { warning: number; critical: number } | undefined,
): string {
  if (color) return color
  if (!thresholds) return DEFAULT_PROGRESS_COLOR
  if (percentage >= thresholds.critical) return THRESHOLD_CRITICAL_COLOR
  if (percentage >= thresholds.warning) return THRESHOLD_WARNING_COLOR
  return THRESHOLD_OK_COLOR
}

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: string
  variant?: 'default' | 'gradient' | 'striped'
  thresholds?: {
    warning: number
    critical: number
  }
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  size = 'md',
  color,
  variant = 'default',
  thresholds,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const currentColor = resolveThresholdColor(percentage, color, thresholds)

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-sm text-muted-foreground">{label}</span>
          )}
          {showValue && (
            <span className="text-sm font-medium text-foreground">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-secondary rounded-full overflow-hidden', sizeClasses[size])}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            variant === 'striped' && 'bg-striped animate-stripe'
          )}
          style={{
            width: `${percentage}%`,
            backgroundColor: variant !== 'gradient' ? currentColor : undefined,
            backgroundImage:
              variant === 'gradient'
                ? `linear-gradient(90deg, ${currentColor}, ${currentColor}dd)`
                : variant === 'striped'
                ? `linear-gradient(45deg, ${currentColor}80 25%, transparent 25%, transparent 50%, ${currentColor}80 50%, ${currentColor}80 75%, transparent 75%, transparent)`
                : undefined,
            backgroundSize: variant === 'striped' ? '1rem 1rem' : undefined,
            boxShadow: `0 0 8px ${currentColor}40`,
          }}
        />
      </div>
    </div>
  )
}

// Segmented progress bar showing multiple segments
interface SegmentedProgressBarProps {
  segments: Array<{
    value: number
    color: string
    label?: string
  }>
  max?: number
  size?: 'sm' | 'md' | 'lg'
  showLegend?: boolean
  title?: string
}

export function SegmentedProgressBar({
  segments,
  max,
  size = 'md',
  showLegend = true,
  title,
}: SegmentedProgressBarProps) {
  const total = max || segments.reduce((sum, s) => sum + s.value, 0) || 1

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div className={cn('w-full bg-secondary rounded-full overflow-hidden flex', sizeClasses[size])}>
        {segments.map((segment, index) => (
          <div
            key={index}
            className="h-full transition-all duration-500"
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-3 mt-2">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-xs text-muted-foreground">
                {segment.label || `Segment ${index + 1}`}
              </span>
              <span className="text-xs font-medium text-foreground">
                {segment.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Circular progress indicator
interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  showValue?: boolean
  label?: string
  formatValue?: (percentage: number) => string
  thresholds?: {
    warning: number
    critical: number
  }
}

export function CircularProgress({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  color,
  showValue = true,
  label,
  formatValue,
  thresholds,
}: CircularProgressProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference
  const currentColor = resolveThresholdColor(percentage, color, thresholds)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={currentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.5s ease',
              filter: `drop-shadow(0 0 6px ${currentColor}40)`,
            }}
          />
        </svg>
        {showValue && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-foreground">
              {formatValue ? formatValue(percentage) : `${Math.round(percentage)}%`}
            </span>
          </div>
        )}
      </div>
      {label && (
        <span className="text-sm text-muted-foreground mt-1">{label}</span>
      )}
    </div>
  )
}
