import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UnreachableIndicatorProps {
  /** Size of the indicator */
  size?: 'sm' | 'md' | 'lg'
  /** Show text label alongside icon */
  showLabel?: boolean
  /** Custom tooltip text */
  tooltip?: string
  /** Additional CSS classes */
  className?: string
}

const SIZES = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

const LABEL_SIZES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

/**
 * Consistent indicator for unreachable clusters
 * Displays a yellow wifi-off icon with standardized tooltip
 */
export function UnreachableIndicator({
  size = 'sm',
  showLabel = false,
  tooltip = 'Offline - check network connection',
  className = '',
}: UnreachableIndicatorProps) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center gap-1 text-yellow-400 ${className}`}
      title={tooltip}
    >
      <WifiOff className={SIZES[size]} />
      {showLabel && (
        <span className={LABEL_SIZES[size]}>{t('common.offline')}</span>
      )}
    </span>
  )
}

/**
 * Inline value display that shows "-" for unreachable clusters
 * with the unreachable indicator on hover
 */
interface UnreachableValueProps {
  /** Whether the cluster is reachable/healthy */
  isReachable: boolean
  /** The value to display when reachable */
  value: number | string
  /** Format function for the value */
  formatValue?: (val: number | string) => string
  /** Additional text suffix */
  suffix?: string
  /** Additional CSS classes */
  className?: string
}

export function UnreachableValue({
  isReachable,
  value,
  formatValue,
  suffix = '',
  className = '',
}: UnreachableValueProps) {
  if (!isReachable) {
    return (
      <span
        className={`text-muted-foreground ${className}`}
        title="Offline - check network connection"
      >
        -{suffix && ` ${suffix}`}
      </span>
    )
  }

  const displayValue = formatValue ? formatValue(value) : value
  return (
    <span className={className}>
      {displayValue}{suffix && ` ${suffix}`}
    </span>
  )
}
