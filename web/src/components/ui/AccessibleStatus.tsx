import { cn } from '../../lib/cn'
import {
  STATUS_CONFIG,
  StatusLevel,
  normalizeStatus,
  getPatternClass,
} from '../../lib/accessibility'
import { useAccessibility } from '../../hooks/useAccessibility'

interface AccessibleStatusBadgeProps {
  status: StatusLevel | string
  label?: string
  showIcon?: boolean
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Accessible status badge that uses icons and patterns alongside colors
 * Automatically adapts based on color blind mode setting
 */
export function AccessibleStatusBadge({
  status,
  label,
  showIcon = true,
  showLabel = true,
  size = 'md',
  className,
}: AccessibleStatusBadgeProps) {
  const { colorBlindMode } = useAccessibility()
  const normalizedStatus = typeof status === 'string' ? normalizeStatus(status) : status
  const config = STATUS_CONFIG[normalizedStatus]
  const Icon = config.icon
  const displayLabel = label || config.label

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        sizeClasses[size],
        config.bgClass,
        config.borderClass,
        config.textClass,
        colorBlindMode && getPatternClass(config.pattern),
        className
      )}
      role="status"
      aria-label={config.ariaLabel}
    >
      {showIcon && (
        <Icon
          className={cn(
            iconSizes[size],
            normalizedStatus === 'loading' && 'animate-spin'
          )}
          aria-hidden="true"
        />
      )}
      {showLabel && <span>{displayLabel}</span>}
    </span>
  )
}

interface AccessibleStatusDotProps {
  status: StatusLevel | string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
  title?: string
}

/**
 * Accessible status dot that shows icon in color blind mode
 * Falls back to colored dot with pattern for accessibility
 */
export function AccessibleStatusDot({
  status,
  size = 'md',
  showIcon: forceShowIcon,
  className,
  title,
}: AccessibleStatusDotProps) {
  const { colorBlindMode } = useAccessibility()
  const normalizedStatus = typeof status === 'string' ? normalizeStatus(status) : status
  const config = STATUS_CONFIG[normalizedStatus]
  const Icon = config.icon
  const showIcon = forceShowIcon ?? colorBlindMode

  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  if (showIcon) {
    return (
      <span title={title || config.label}>
        <Icon
          className={cn(iconSizes[size], config.colorClass, className)}
          role="img"
          aria-label={config.ariaLabel}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        dotSizes[size],
        config.bgClass.replace('/20', ''),
        colorBlindMode && getPatternClass(config.pattern),
        className
      )}
      role="img"
      aria-label={config.ariaLabel}
      title={title || config.label}
    />
  )
}

interface AccessibleStatusTextProps {
  status: StatusLevel | string
  label?: string
  showIcon?: boolean
  className?: string
}

/**
 * Accessible status text with optional icon
 */
export function AccessibleStatusText({
  status,
  label,
  showIcon = true,
  className,
}: AccessibleStatusTextProps) {
  const { colorBlindMode } = useAccessibility()
  const normalizedStatus = typeof status === 'string' ? normalizeStatus(status) : status
  const config = STATUS_CONFIG[normalizedStatus]
  const Icon = config.icon
  const displayLabel = label || config.label

  // Always show icon in color blind mode
  const shouldShowIcon = showIcon || colorBlindMode

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', config.textClass, className)}
      role="status"
      aria-label={config.ariaLabel}
    >
      {shouldShowIcon && (
        <Icon
          className={cn(
            'w-4 h-4',
            normalizedStatus === 'loading' && 'animate-spin'
          )}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </span>
  )
}

interface StatusIconProps {
  status: StatusLevel | string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Just the status icon with appropriate color
 */
export function StatusIcon({ status, size = 'md', className }: StatusIconProps) {
  const normalizedStatus = typeof status === 'string' ? normalizeStatus(status) : status
  const config = STATUS_CONFIG[normalizedStatus]
  const Icon = config.icon

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  return (
    <Icon
      className={cn(
        iconSizes[size],
        config.colorClass,
        normalizedStatus === 'loading' && 'animate-spin',
        className
      )}
      role="img"
      aria-label={config.ariaLabel}
    />
  )
}
